import moment from 'moment';
import api from '../lib/api';

export default function (server, options) {
    /**
     * Fileds to retrieve
     */
    const dataCluster = server.plugins.elasticsearch.getCluster('data');
    const call = dataCluster.callWithInternalUser;
    const basePath = server.config().get('server.basePath');

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
                                field: 'type',
                                size: 1000
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
                                field: "host",
                                size: 1000
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
                                field: "source",
                                size: 1000
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
            api.requestPageHandler(req, reply);
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

            config.body.sort.push(api.getSort(req.query.sortType));

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

            api.deleteFile(fileName);

            call('search', config).then(function (resp) {

                /*if (error) {
                 reply({
                 error: error
                 });

                 return;
                 }*/

                if (resp.hits.hits.length > 0) {

                    api.parseLogLinesIds(resp.hits.hits, fileName);

                    if (resp._scroll_id) {

                        api.requestMorePages(resp._scroll_id, fileName, function () {

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

            config.body.sort.push(api.getSort(req.query.sortType));

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

            api.deleteFile(fileName);

            call('search', config).then(function (resp) {

                /*if (error) {
                 reply({
                 error: error
                 });

                 return;
                 }*/

                if (resp.hits.hits.length > 0) {

                    api.parseLogLinesIds(resp.hits.hits, fileName);

                    if (resp._scroll_id) {

                        api.requestMorePages(resp._scroll_id, fileName, function () {

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

            reply(api.getLine(req.query.match, fileToUse, 'matches' + req.query.timestamp + '.txt'));
        }
    });
}