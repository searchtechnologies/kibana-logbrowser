const fs = require('fs');
const path = require('path');
const request = require('sync-request');
let utils = require('requirefrom')('src/utils');
let fromRoot = utils('fromRoot');

export default function (server, options) {

  const retrieveFields = ['message', '@timestamp', 'host', 'log_time'];

  const call = server.plugins.elasticsearch.callWithRequest;
  const client = server.plugins.elasticsearch.client;

  /***********************************************
   * Server Side Functions
   ***********************************************/

  const getFilePath = function(fileName) {
    //return path.join(__dirname, '..\\..\\filesIds', fileName);
    return path.join('c:', 'filesIds', fileName);
  };

  /**
   *  Write ids in to a file
   *
   * @param ids
   */
  const writeToFileIds = function (ids, name) {

    var idsString = ids.toString().replace(/,/g , '\n');

    var file = getFilePath(name);

    fs.appendFileSync(file, idsString + '\n');

  };

  const deleteFile = function (name) {

    var file = getFilePath(name);

    fs.exists(file, (exists) => {
      if (exists) {
        fs.unlinkSync(file);
      } else {
        try {
          fs.mkdirSync(path.dirname(file), (err) => {
            if (err) throw err;
          });
        } catch (e) {
          if (e.code != 'EEXIST') throw e;
        }
      }
    });
  };

  const parseLogLinesIds = function (log_lines, fileName) {
    var ids = [];

    log_lines.forEach(function (obj) {
      ids.push(obj._id);
    });

    if (ids.length > 0)
      writeToFileIds(ids, fileName);
  };

  const parseLogLines = function (log_lines) {

    var lines = [];

    log_lines.forEach(function (obj) {

      var time = obj.fields['@timestamp'][0];

      var line = {
        id: obj._id,
        message: obj.fields.message[0],
        timestamp: time,
        host: obj.fields.host[0]
      };

      if (obj.fields.log_time)
        line.log_time = obj.fields.log_time[0];

      if(obj.highlight && obj.highlight.message && obj.highlight.message.length > 0) {
        line.message = obj.highlight.message[0];
      }

      lines.push(line);
    });


    return lines;
  };

  const getLine = function(matchNum, fileName, matchFileName, matchOnly) {

    var file = getFilePath(fileName);
    var matchFile = getFilePath(matchFileName);

    var results = fs.readFileSync(file, 'utf8');
    var matches = fs.readFileSync(matchFile, 'utf8');

    var resultLines = results.split('\n');
    resultLines.pop();

    var matchLines = matches.split('\n');
    matchLines.pop();

    return {
      position: resultLines.indexOf(matchLines[matchNum]),
      total: matchOnly ? matchLines.length : resultLines.length
    };
  };

  const getPage = function (pageNum, size, fileName) {

    size = parseInt(size);

    if (pageNum !== undefined && !Array.isArray(pageNum)) {
      pageNum = [pageNum];
    }

    var file = getFilePath(fileName);

    var data = fs.readFileSync(file, 'utf8');
    var lines = data.split('\n');
    lines.pop();

    var ids = [];

    pageNum = pageNum.filter(function (elem, index, self) {
      return index == self.indexOf(elem);
    });

    pageNum.forEach((num, i) => {

      num = parseInt(num);

      num = num < 0 ? 0 : num;

      var totalPages = Math.ceil(lines.length / size) - 1;

      num = num >= totalPages ? totalPages : num;

      if (num > lines.length) {
        throw new Error('File end reached without finding line');
      }

      var top = (num * size + size);

      top = top > lines.length ? lines.length : top;

      for (let i = num * size; i < top; i++) {
          ids.push(lines[i]);
      }
    });

    return {
      ids: ids,
      total: lines.length
    };
  };

  const requestMorePages = function (scrollId, fileName, callback) {

    var config = {
      scrollId: scrollId,
      scroll: '5s'
    };

    client.scroll(config, function (error, resp) {

      if(error) {
        reply({
          error: error
        });

        return;
      }

      if (resp.hits.hits.length > 0) {
        parseLogLinesIds(resp.hits.hits, fileName);
        requestMorePages(resp._scroll_id, fileName, callback);

      } else {
        callback();
      }
    });
  };

  const requestPageHandler = function (req, reply) {

    var fileToUse = 'fileIds' + req.query.timestamp + '.txt';

    if(req.query.onlyMatchLines !== 'false') {
      fileToUse = 'matches' + req.query.timestamp + '.txt'
    }

    var page = getPage(req.query.page || [0], req.query.pageSize, fileToUse);

    var config = {
      index: req.query.index,
      body: {
        sort: [],
        size: req.query.pageSize * req.query.page.length,
        fields: retrieveFields,
        query: {
          ids: {
            values: page.ids
          }
        }
      }
    };

    if(req.query.query) {
      config.body.highlight = {
        "fields" : {
          "message" : {
            "number_of_fragments": 1,
            "fragment_size": 2000,
            "highlight_query": {
              "query_string": {
                "default_field": "message",
                "query": req.query.query || ''
              }
            }
          }
        }
      }
    }

    config.body.sort.push(getSort(req.query.sortType));

    client.search(config, function (error, resp) {

      if(error) {
        reply({
          error: error
        });

        return;
      }

      var lines = parseLogLines(resp.hits.hits);

      var result = {
        lines: lines,
        total: page.total
      };

      reply(result);
    });

  };

  const getSort = function(type) {

    var sortType = {};

    sortType[type] = {
      "order": "asc"
    };

    if(type === '_script') {
      sortType[type].script = "doc.message.value.length() > 40 ? doc.message.value.substring(0,40) : doc.message.value";
      sortType[type].type = 'string';
      sortType[type].lang= 'groovy';
    }

    return sortType;
  };

  /***********************************************
   * Plugin Routes
   ***********************************************/

  server.route({
    path: '/api/kibana_logger',
    method: 'GET',
    handler(req, reply) {
      reply('Kibana Logger online');
    }
  });

  server.route({
    path: '/api/kibana_logger/indices',
    method: 'GET',
    handler(req, reply) {

      call(req, 'cluster.state').then(function (resp) {

        var keys = Object.keys(resp.metadata.indices);

        var indices = [];

        keys.forEach(function (key) {
          if (key != '.kibana')
            indices.push({id: key, name: key});
        });


        reply({indices: indices});
      });

    }
  });

  server.route({
    path: '/api/kibana_logger/serverTypes/{index}',
    method: 'GET',
    handler(req, reply) {

      var config = {
        index: req.params.index,
        body: {
          size: 0,
          aggregations: {
            types: {
              terms: {
                field: 'type'
              }
            }
          }
        }
      };

      client.search(config, function (error, resp) {

        if(error) {
          reply({
            error: error
          });

          return;
        }

        var serverTypess = [];

        resp.aggregations.types.buckets.forEach(function (obj) {
          serverTypess.push({id: obj.key, name: obj.key});
        });

        reply({serverTypes: serverTypess});
      });

    }
  });

  server.route({
    path: '/api/kibana_logger/servers/{index}/{server_type}',
    method: 'GET',
    handler(req, reply) {
      client.search({
        index: req.params.index,
        body: {
          size: 0,
          query: {
            match: {
              type: req.params.server_type
            }
          },
          aggregations: {
            hosts: {
              terms: {
                field: "host"
              }
            }
          }
        }
      }, function (error, resp) {

        if(error) {
          reply({
            error: error
          });

          return;
        }

        var servers = [];

        resp.aggregations.hosts.buckets.forEach(function (obj) {
          servers.push({id: obj.key, name: obj.key});
        });

        reply({servers: servers});
      });

    }
  });

  server.route({
    path: '/api/kibana_logger/files/{index}/{server_type}',
    method: 'GET',
    handler(req, reply) {

      var config = {
        index: req.params.index,
        body: {
          size: 0,
          query: {
            "bool": {
              "must": [{
                "match":{"type": req.params.server_type}
              }],
              "should": []
            }
          },
          aggregations: {
            paths: {
              terms: {
                field: "path"
              }
            }
          }
        }
      };

      if(req.query.servers) {
        if (!Array.isArray(req.query.servers)) {
          req.query.servers = [req.query.servers]
        }

        req.query.servers.forEach((server)=> {
          config.body.query.bool.should.push({
            "match": {host: server}
          });
        });
      }

      client.search(config, function (error, resp) {

        if(error) {
          reply({
            error: error
          });

          return;
        }

        var files = [];

        resp.aggregations.paths.buckets.forEach(function (obj) {
          files.push({id: obj.key, name: obj.key});
        });

        reply({files: files});
      });

    }
  });

  server.route({
    path: '/api/kibana_logger/browse',
    method: 'GET',
    handler(req, reply) {
      requestPageHandler(req, reply);
    }
  });

  server.route({
    path: '/api/kibana_logger/browsePages',
    method: 'GET',
    handler(req, reply) {

      var fileName = 'fileIds' + req.query.timestamp + '.txt';

      var config = {
        index: req.query.index,
        scroll: '5s',
        body: {
          sort: [],
          size: 1000,
          fields: [],
          query: {
            "bool": {
              "must": [{
                "match":{"type": req.query.serverType}
              }],
              "should": []
            }
          }
        }
      };

      if(req.query.files) {
        if(!Array.isArray(req.query.files)) {
          req.query.files = [req.query.files]
        }

        req.query.files.forEach((file)=>{
          config.body.query.bool.should.push({
            "match":{path: file}
          });
        });
      }

      config.body.sort.push(getSort(req.query.sortType));

      deleteFile(fileName);

      client.search(config, function (error, resp) {

        if(error) {
          reply({
            error: error
          });

          return;
        }

        if (resp.hits.hits.length > 0) {

          parseLogLinesIds(resp.hits.hits, fileName);

          if (resp._scroll_id) {

            requestMorePages(resp._scroll_id, fileName, function () {

              var result = {
                total: resp.hits.total
              };

              reply(result);
            });
          }
        } else {
          reply({
            lines: 0,
            total: 0,
            pageSize: 0
          });
        }
      });

    }
  });

  server.route({
    path: '/api/kibana_logger/find',
    method: 'GET',
    handler(req, reply) {

      var fileName = 'matches' + req.query.timestamp + '.txt';

      var config = {
        index: req.query.index,
        scroll: '5s',
        body: {
          sort: [],
          size: 1000,
          fields: [],
          query: {
            "bool": {
              "must": [
                {
                  "match":{"type": req.query.serverType}
                },
                {
                  "query_string": {
                    "default_field": "message",
                    "query": req.query.query
                  }
                }
              ],
            "should": []
            }
          }
        }
      };

      if(req.query.files) {
        if(!Array.isArray(req.query.files)) {
          req.query.files = [req.query.files]
        }

        req.query.files.forEach((file)=>{
          config.body.query.bool.should.push({
            "match":{path: file}
          });
        });
      }

      config.body.sort.push(getSort(req.query.sortType));

      deleteFile(fileName);

      client.search(config, function (error, resp) {

        if(error) {
          reply({
            error: error
          });

          return;
        }

        if (resp.hits.hits.length > 0) {

          parseLogLinesIds(resp.hits.hits, fileName);

          if (resp._scroll_id) {

            requestMorePages(resp._scroll_id, fileName, function () {

              var result = {
                total: resp.hits.total
              };

              reply(result);
            });
          }
        } else {
          reply({
            lines: 0,
            total: 0,
            pageSize: 0
          });
        }
      });
    }
  });

  server.route({
    path: '/api/kibana_logger/findOne',
    method: 'GET',
    handler(req, reply) {

      var fileToUse = 'fileIds' + req.query.timestamp + '.txt';

      if(req.query.onlyMatchLines !== 'false') {
        fileToUse = 'matches' + req.query.timestamp + '.txt'
      }

      reply(getLine(req.query.match, fileToUse, 'matches' + req.query.timestamp + '.txt'));
    }
  })
};
