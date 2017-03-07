import fs from "fs";
import path from "path";
import moment from "moment";
import _ from "lodash";
//import request from 'sync-request';
//let utils = require('requirefrom')('src/utils');
//let fromRoot = utils('fromRoot');

export default function (server, options) {

    /**
     * Fileds to retrieve
     */
    const retrieveFields = ['message', '@timestamp', 'host', 'log_time'];
    const dataCluster = server.plugins.elasticsearch.getCluster('data');
    const call = dataCluster.callWithInternalUser;
    //const client = server.plugins.elasticsearch.client;
    const basePath = server.config().get('server.basePath');

    /***********************************************
     * Server Side Functions
     ***********************************************/

    const getFilePath = function (fileName) {
        //TODO: for testing return path.join('C:\\dev\\Kibana\\Kibana plugin env', '\\filesIds', fileName);
        return path.join(__dirname, '..\\filesIds', fileName);
    };

    /**
     *  Write ids in to a file
     *
     * @param ids
     */
    const writeToFileIds = function (ids, name) {

        let idsString = ids.toString().replace(/,/g, '\n');

        let file = getFilePath(name);

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
        let ids = [];

        log_lines.forEach(function (obj) {
            ids.push(obj._id);
        });

        if (ids.length > 0)
            writeToFileIds(ids, fileName);
    };

    const parseLogLines = function (log_lines) {

        let lines = [];

        log_lines.forEach(function (obj) {

            let time = _.isArray(obj._source['@timestamp']) ? obj._source['@timestamp'][0] : obj._source['@timestamp'];

            let line = {
                id: obj._id,
                message: _.isArray(obj._source.message) ? obj._source.message[0] : obj._source.message,
                timestamp: time,
                host: _.isArray(obj._source.host) ? obj._source.host[0] : obj._source.host
            };

            if (obj._source.log_time)
                line.log_time = _.isArray(obj._source.log_time) ? obj._source.log_time[0] : obj._source.log_time;

            if (obj.highlight && obj.highlight.message && obj.highlight.message.length > 0) {
                line.message = _.isArray(obj.highlight.message) ? obj.highlight.message[0] : obj.highlight.message;
            }

            lines.push(line);
        });


        return lines;
    };

    /**
     *
     * @param matchNum Number of the match line
     * @param fileName File name with the lines
     * @param matchFileName File name with the matches only
     * @param matchOnly Should only show matches
     * @returns {{position: number, total: Number}}
     */
    const getLine = function (matchNum, fileName, matchFileName, matchOnly) {

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

        var data;

        try {
            data = fs.readFileSync(file, 'utf8');
        } catch (err) {
            throw new Error('No results to show');
        }
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

        let config = {
            scrollId: scrollId,
            scroll: '5s'
        };

        call('scroll', config).then(function (resp) {
            /*if (error) {
             reply({
             error: error
             });

             return;
             }*/

            if (resp.hits.hits.length > 0) {
                parseLogLinesIds(resp.hits.hits, fileName);
                requestMorePages(resp._scroll_id, fileName, callback);

            } else {
                callback();
            }
        });
    };

    const requestPageHandler = function (req, reply) {

        let fileToUse = 'fileIds' + req.query.timestamp + '.txt';

        if (req.query.onlyMatchLines !== 'false') {
            fileToUse = 'matches' + req.query.timestamp + '.txt'
        }

        let page;

        try {
            page = getPage(req.query.page || [0], req.query.pageSize, fileToUse);
        } catch (error) {

            reply({
                error: {
                    msg: error.toString().replace('Error: ', '')
                }
            });
            return;
        }

        let config = {
            index: req.query.index,
            body: {
                sort: [],
                size: req.query.pageSize * req.query.page.length,
                _source: retrieveFields,
                query: {
                    ids: {
                        values: page.ids
                    }
                }
            }
        };

        if (req.query.query) {
            config.body.highlight = {
                "fields": {
                    "message": {
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

        call('search', config).then(function (resp) {

            /*if (error) {
             reply({
             error: error
             });

             return;
             }*/

            let lines = parseLogLines(resp.hits.hits);

            let result = {
                lines: lines,
                total: page.total
            };

            reply(result);
        });

    };

    const getSort = function (type) {

        let sortType = {};

        sortType[type] = {
            "order": "asc"
        };

        return sortType;
    };

    /***********************************************
     * Plugin Routes
     ***********************************************/

    server.route({
        path: '/api/log_browser',
        method: 'GET',
        handler(req, reply) {
            reply('Kibana Logger online');
        }
    });

    server.route({
        path: '/api/log_browser/indices/{day}',
        method: 'GET',
        handler(req, reply) {

            call('cat.indices', {format: 'json'}).then(function (resp) {

                let indices = [];

                resp.forEach(function (elem) {

                    if ((elem.index !== '.kibana') && (elem.index.indexOf(req.params.day) >= 0))
                        indices.push({id: elem.index, name: elem.index});
                });

                reply({indices: indices});
            });

        }
    });

    server.route({
        path: '/api/log_browser/serverTypes/{index}',
        method: 'GET',
        handler(req, reply) {

            let config = {
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

            call('search', config).then(function (resp) {

                let serverTypess = [];

                resp.aggregations.types.buckets.forEach(function (obj) {
                    serverTypess.push({id: obj.key, name: obj.key});
                });

                reply({serverTypes: serverTypess});
            });

        }
    });

    server.route({
        path: '/api/log_browser/servers/{index}/{server_type}',
        method: 'GET',
        handler(req, reply) {

            let config = {
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
            };

            call('search', config).then(function (resp) {

                /*if (error) {
                 reply({
                 error: error
                 });

                 return;
                 }*/

                let servers = [];

                resp.aggregations.hosts.buckets.forEach(function (obj) {
                    servers.push({id: obj.key, name: obj.key});
                });

                reply({servers: servers});
            });
        }
    });

    server.route({
        path: '/api/log_browser/files/{index}/{server_type}',
        method: 'GET',
        handler(req, reply) {

            let config = {
                index: req.params.index,
                body: {
                    size: 0,
                    query: {
                        "bool": {
                            "must": [],
                            "should": []
                        }
                    },
                    aggregations: {
                        paths: {
                            terms: {
                                field: "source"
                            }
                        }
                    }
                }
            };

            if (req.query.servers) {
                if (!Array.isArray(req.query.servers)) {
                    req.query.servers = [req.query.servers]
                }

                config.body.query.bool.should.push({"match": {"type": req.params.server_type}});

                req.query.servers.forEach((server) => {
                    config.body.query.bool.should.push({
                        "match": {host: server}
                    });
                });

                config.body.query.bool.minimum_should_match = 2;
            } else {
                config.body.query.bool.must.push({"match": {"type": req.params.server_type}});
            }

            call('search', config).then(function (resp) {

                let files = [];

                resp.aggregations.paths.buckets.forEach(function (obj) {
                    files.push({id: obj.key, name: obj.key});
                });

                reply({files: files});
            });

        }
    });

    server.route({
        path: '/api/log_browser/browse',
        method: 'GET',
        handler(req, reply) {
            requestPageHandler(req, reply);
        }
    });

    server.route({
        path: '/api/log_browser/browsePages',
        method: 'GET',
        handler(req, reply) {

            let fileName = 'fileIds' + req.query.timestamp + '.txt';

            let config = {
                index: req.query.index,
                scroll: '5s',
                body: {
                    sort: [],
                    size: 1000,
                    _source: [],
                    query: {
                        "bool": {
                            "must": [],
                            "should": []
                        }
                    }
                }
            };

            if ((req.query.servers) && (req.query.files)) {

                if (!Array.isArray(req.query.servers)) {
                    req.query.servers = [req.query.servers]
                }

                if (!Array.isArray(req.query.files)) {
                    req.query.files = [req.query.files]
                }

                config.body.query.bool.should.push({"match": {"type": req.query.serverType}});

                req.query.files.forEach((file) => {
                    config.body.query.bool.should.push({
                        "match": {source: file}
                    });
                });

                req.query.servers.forEach((server) => {
                    config.body.query.bool.should.push({
                        "match": {host: server}
                    });
                });

                config.body.query.bool.minimum_should_match = 3;
            } else if (req.query.servers) {

                if (!Array.isArray(req.query.servers)) {
                    req.query.servers = [req.query.servers]
                }

                config.body.query.bool.should.push({"match": {"type": req.query.serverType}});

                req.query.servers.forEach((server) => {
                    config.body.query.bool.should.push({
                        "match": {host: server}
                    });
                });

                config.body.query.bool.minimum_should_match = 2;
            } else {
                config.body.query.bool.must.push({"match": {"type": req.query.serverType}});
            }

            config.body.sort.push(getSort(req.query.sortType));

            //Convert Times to JSON
            req.query.startTime = JSON.parse(req.query.startTime);
            req.query.endTime = JSON.parse(req.query.endTime);

            //Add Filter is necessary
            if (req.query.startTime.use || req.query.endTime.use) {

                config.body.query.bool.filter = {
                    "range": {
                        "@timestamp": {
                            "format": "yyyy-MM-dd'T'HH:mm:ssZ"
                        }
                    }
                };

                let date = moment(new Date(req.query.date)).format('YYYY-MM-DD') + 'T';

                if (req.query.startTime.use) {
                    config.body.query.bool.filter.range["@timestamp"].gte = date + req.query.startTime.hour + ':' + req.query.startTime.minute + ':00Z';
                }

                if (req.query.endTime.use) {
                    config.body.query.bool.filter.range["@timestamp"].lte = date + req.query.endTime.hour + ':' + req.query.endTime.minute + ':59Z';
                }
            }

            deleteFile(fileName);

            call('search', config).then(function (resp) {

                /*if (error) {
                 reply({
                 error: error
                 });

                 return;
                 }*/

                if (resp.hits.hits.length > 0) {

                    parseLogLinesIds(resp.hits.hits, fileName);

                    if (resp._scroll_id) {

                        requestMorePages(resp._scroll_id, fileName, function () {

                            let result = {
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
        path: '/api/log_browser/find',
        method: 'GET',
        handler(req, reply) {

            let fileName = 'matches' + req.query.timestamp + '.txt';

            let config = {
                index: req.query.index,
                scroll: '5s',
                body: {
                    sort: [],
                    size: 1000,
                    _source: [],
                    query: {
                        "bool": {
                            "must": [],
                            "should": []
                        }
                    }
                }
            };

            if ((req.query.servers) && (req.query.files)) {

                if (!Array.isArray(req.query.servers)) {
                    req.query.servers = [req.query.servers]
                }

                if (!Array.isArray(req.query.files)) {
                    req.query.files = [req.query.files]
                }

                config.body.query.bool.should.push({"match": {"type": req.query.serverType}});

                config.body.query.bool.should.push({
                    "query_string": {
                        "default_field": "message",
                        "query": req.query.query
                    }
                });

                req.query.files.forEach((file) => {
                    config.body.query.bool.should.push({
                        "match": {source: file}
                    });
                });

                req.query.servers.forEach((server) => {
                    config.body.query.bool.should.push({
                        "match": {host: server}
                    });
                });

                config.body.query.bool.minimum_should_match = 4;
            } else if (req.query.servers) {

                if (!Array.isArray(req.query.servers)) {
                    req.query.servers = [req.query.servers]
                }

                config.body.query.bool.should.push({"match": {"type": req.query.serverType}});

                config.body.query.bool.should.push({
                    "query_string": {
                        "default_field": "message",
                        "query": req.query.query
                    }
                });

                req.query.servers.forEach((server) => {
                    config.body.query.bool.should.push({
                        "match": {host: server}
                    });
                });

                config.body.query.bool.minimum_should_match = 3;
            } else {

                config.body.query.bool.must.push({"match": {"type": req.query.serverType}});
                config.body.query.bool.must.push({
                    "query_string": {
                        "default_field": "message",
                        "query": req.query.query
                    }
                });
            }

            config.body.sort.push(getSort(req.query.sortType));

            //Convert Times to JSON
            req.query.startTime = JSON.parse(req.query.startTime);
            req.query.endTime = JSON.parse(req.query.endTime);

            //Add Filter is necessary
            if (req.query.startTime.use || req.query.endTime.use) {

                config.body.query.bool.filter = {
                        "range": {
                            "@timestamp": {
                                "format": "yyyy-MM-dd'T'HH:mm:ss"
                            }
                        }
                    };

                let date = moment(new Date(req.query.date)).format('YYYY-MM-DD') + 'T';

                if (req.query.startTime.use) {
                    config.body.query.bool.filter.range["@timestamp"].gte = date + req.query.startTime.hour + ':' + req.query.startTime.minute + ':00';
                }

                if (req.query.endTime.use) {
                    config.body.query.bool.filter.range["@timestamp"].lte = date + req.query.endTime.hour + ':' + req.query.endTime.minute + ':59';
                }
            }

            deleteFile(fileName);

            call('search', config).then(function (resp) {

                /*if (error) {
                 reply({
                 error: error
                 });

                 return;
                 }*/

                if (resp.hits.hits.length > 0) {

                    parseLogLinesIds(resp.hits.hits, fileName);

                    if (resp._scroll_id) {

                        requestMorePages(resp._scroll_id, fileName, function () {

                            let result = {
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
        path: '/api/log_browser/findOne',
        method: 'GET',
        handler(req, reply) {

            let fileToUse = 'fileIds' + req.query.timestamp + '.txt';

            if (req.query.onlyMatchLines !== 'false') {
                fileToUse = 'matches' + req.query.timestamp + '.txt'
            }

            reply(getLine(req.query.match, fileToUse, 'matches' + req.query.timestamp + '.txt'));
        }
    })
};
