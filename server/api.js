const fs = require('fs');
const path = require('path');
const request = require('sync-request');
let utils = require('requirefrom')('src/utils');
let fromRoot = utils('fromRoot');

export default function (server, options) {

  const retrieveFileds = ['message', '@timestamp', 'host', 'log_time'];
  //const fileIds = path.join(__dirname, '..\\..\\filesIds', 'fileIds.txt');
  const fileIds = path.join('c:', 'filesIds', 'fileIds.txt');

  const call = server.plugins.elasticsearch.callWithRequest;
  const client = server.plugins.elasticsearch.client;

  /***********************************************
   * Server Side Functions
   ***********************************************/

  const getFilePath = function(fileName) {
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

    console.log('appending to file: ' + ids.length);
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
        console.log('highlight for ' + obj.id);
        line.message = obj.highlight.message[0];
      }

      lines.push(line);
    });


    return lines;
  };

  const getLine = function(matchNum, fileName, matchFileName) {

    var file = getFilePath(fileName);
    var matchFile = getFilePath(matchFileName);

    var results = fs.readFileSync(file, 'utf8');
    var matches = fs.readFileSync(matchFile, 'utf8');

    var resultLines = results.split('\n');
    resultLines.pop();

    var matchLines = matches.split('\n');
    matchLines.pop();

    return resultLines.indexOf(matchLines[matchNum]);
  };

  const getPage = function (pageNum, size, fileName) {

    size = parseInt(size);
    console.log('page size: ', size);

    if (pageNum !== undefined && !Array.isArray(pageNum)) {
      pageNum = [pageNum];
    }

    var file = getFilePath(fileName);

    var data = fs.readFileSync(file, 'utf8');
    var lines = data.split('\n');
    lines.pop();

    console.log('lines: ' + lines.length + ' / first: ' + lines[0] + ' / last: '  + lines[lines.length-1]);

    var ids = [];

    pageNum = pageNum.filter(function (elem, index, self) {
      return index == self.indexOf(elem);
    });

    console.log('pages: ' + pageNum);

    pageNum.forEach((num, i) => {

      num = parseInt(num);

      console.log('getting page ' + i+':'+num);

      num = num < 0 ? 0 : num;

      var totalPages = Math.ceil(lines.length / size) - 1;

      console.log('total pages: ' + totalPages);

      num = num >= totalPages ? totalPages : num;

      if (num > lines.length) {
        throw new Error('File end reached without finding line');
      }

      var top = (num * size + size);

      top = top > lines.length ? lines.length : top;


      console.log('bottom element: '+ num * size +' / top element:' + top);

      for (let i = num * size; i < top; i++) {
          ids.push(lines[i]);
      }
    });

    console.log(ids.length);
    console.log(ids[0] +' - ' + ids[ids.length - 1]);

    return ids;
  };

  const requestMorePages = function (scrollId, fileName, callback) {

    var config = {
      scrollId: scrollId,
      scroll: '5s'
    };

    client.scroll(config, function (error, resp) {

      if (resp.hits.hits.length > 0) {
        parseLogLinesIds(resp.hits.hits, fileName);
        requestMorePages(resp._scroll_id, fileName, callback);

      } else {
        callback();
      }
    });
  };

  const requestPageHandler = function (req, reply) {

    var config = {
      index: req.query.index,
      body: {
        sort: [],
        size: req.query.pageSize * req.query.page.length,
        fields: retrieveFileds,
        query: {
          ids: {
            values: getPage(req.query.page || [0], req.query.pageSize, 'fileIds.txt')
          }
        }
      }
    };

    var sortType = {};

    sortType[req.query.sortType] = {
      "order": "asc"
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

    config.body.sort.push(sortType);

    client.search(config, function (error, resp) {

      var lines = parseLogLines(resp.hits.hits);


      var result = {
        lines: lines,
        page: req.query.page
      };

      reply(result);
    });

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
                field: 'server_type'
              }
            }
          }
        }
      };

      client.search(config, function (error, resp) {
        var servers = [];

        resp.aggregations.types.buckets.forEach(function (obj) {
          servers.push({id: obj.key, name: obj.key});
        });

        reply({serverTypes: servers});
      });

    }
  });

  server.route({
    path: '/api/kibana_logger/serverTypes/{index}/{server_type}',
    method: 'GET',
    handler(req, reply) {
      client.search({
        index: req.params.index,
        body: {
          size: 0,
          query: {
            match: {
              server_type: req.params.server_type
            }
          },
          aggregations: {
            hosts: {
              terms: {
                field: "host"
              },
              aggregations: {
                address: {
                  terms: {
                    field: "src_ip"
                  }
                }
              }
            }
          }
        }
      }, function (error, resp) {
        var servers = [];

        resp.aggregations.types.buckets.forEach(function (obj) {
          servers.push({id: obj.key, name: obj.key});
        });

        reply({serverTypes: servers});
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

      var config = {
        index: req.query.index,
        scroll: '5s',
        body: {
          sort: [],
          size: 1000,
          fields: [],
          query: {
            "match": {"server_type": req.query.serverType}
          }
        }
      };

      var sortType = {};

      sortType[req.query.sortType] = {
        "order": "asc"
      };

      config.body.sort.push(sortType);

      deleteFile('fileIds.txt');

      client.search(config, function (error, resp) {

        if (resp.hits.hits.length > 0) {

          parseLogLinesIds(resp.hits.hits, 'fileIds.txt');

          if (resp._scroll_id) {

            requestMorePages(resp._scroll_id, 'fileIds.txt', function () {

              var result = {
                total: resp.hits.total
              };

              console.log('--------------------------------------');
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
                  "match":{"server_type": req.query.serverType}
                },
                {
                  "query_string": {
                    "default_field": "message",
                    "query": req.query.query
                  }
                }
              ]
            }
          }
        }
      };

      var sortType = {};

      sortType[req.query.sortType] = {
        "order": "asc"
      };

      config.body.sort.push(sortType);

      console.log(JSON.stringify(config));

      deleteFile('matches.txt');

      client.search(config, function (error, resp) {

        if (resp.hits.hits.length > 0) {

          parseLogLinesIds(resp.hits.hits, 'matches.txt');

          if (resp._scroll_id) {

            requestMorePages(resp._scroll_id, 'matches.txt', function () {

              var result = {
                total: resp.hits.total
              };

              console.log('--------------------------------------');
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

      var position = getLine(req.query.match, 'fileIds.txt', 'matches.txt');

      reply({
        position: position
      });
    }
  })
};
