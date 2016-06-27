const fs = require('fs');
const path = require('path');
const request = require('sync-request');
let utils = require('requirefrom')('src/utils');
let fromRoot = utils('fromRoot');

var browsePaging = {};

export default function (server, options) {

  const retrieveFileds = ['message', '@timestamp', 'host', 'log_time'];
  //const fileIds = path.join(__dirname, '..\\..\\filesIds', 'fileIds.txt');
  const fileIds = path.join('c:', 'filesIds', 'fileIds.txt');

  const call = server.plugins.elasticsearch.callWithRequest;
  const client = server.plugins.elasticsearch.client;

  /***********************************************
   * Server Side Functions
   ***********************************************/

  /**
   *  Write ids in to a file
   *
   * @param ids
   */
  const writeToFileIds = function (ids) {

    var idsString = ids.toString().replace(/,/g , '\n');

    console.log('appending to file');
    fs.appendFileSync(fileIds, idsString);

  };

  const deleteFileIds = function () {
    fs.exists(fileIds, (exists) => {
      if (exists) {
        fs.unlinkSync(fileIds);
      } else {
        try {
          fs.mkdirSync(path.dirname(fileIds), (err) => {
            if (err) throw err;
          });
        } catch (e) {
          if (e.code != 'EEXIST') throw e;
        }
      }
    });
  };

  const parseLogLinesIds = function (log_lines) {
    var ids = [];

    log_lines.forEach(function (obj) {
      ids.push(obj._id);
    });

    if (ids.length > 0)
      writeToFileIds(ids);
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

      lines.push(line);
    });


    return lines;
  };

  const getPage = function (pageNum, size) {

    size = parseInt(size);
    console.log('page size: ', size);

    if (pageNum !== undefined && !Array.isArray(pageNum)) {
      pageNum = [pageNum];
    }

    var data = fs.readFileSync(fileIds, 'utf8');
    var lines = data.split('\n');

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

  const requestMorePages = function (scrollId, callback) {

    var config = {
      scrollId: scrollId,
      scroll: '5s'
    };

    client.scroll(config, function (error, resp) {

      if (resp.hits.hits.length > 0) {
        parseLogLinesIds(resp.hits.hits);

        if (resp._scroll_id)
          requestMorePages(resp._scroll_id, callback);
        else
          callback();

      } else {
        callback();
      }
    });
  };

  const requestPageHandler = function (req, reply, realTotal) {

    var config = {
      index: req.query.index,
      body: {
        sort: [],
        size: req.query.pageSize * req.query.page.length,
        fields: retrieveFileds,
        query: {
          ids: {
            values: getPage(req.query.page || [0], req.query.pageSize)
          }
        }
      }
    };

    var sortType = {};

    sortType[req.query.sortType] = {
      "order": "asc"
    };

    config.body.sort.push(sortType);

    client.search(config, function (error, resp) {

      var lines = parseLogLines(resp.hits.hits);


      var result = {
        lines: lines,
        page: req.query.page
      };

      if (realTotal !== undefined)
        result.total = realTotal;

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

      console.log('-------------------------------------------------------');

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

      deleteFileIds();

      client.search(config, function (error, resp) {

        if (resp.hits.hits.length > 0) {

          parseLogLinesIds(resp.hits.hits);

          if (resp._scroll_id) {

            requestMorePages(resp._scroll_id, function () {
              //requestPageHandler(req, reply, resp.hits.total);

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


};
