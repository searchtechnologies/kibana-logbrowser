import fs from "fs";
import path from "path";
import _ from "lodash";

const retrieveFields = ['message', '@timestamp', 'host', 'log_time'];

/***********************************************
 * Server Side Functions
 ***********************************************/

exports.getFilePath = function (fileName) {
    //TODO: for testing return path.join('C:\\dev\\Kibana\\Kibana plugin env', '\\filesIds', fileName);
    return path.join(__dirname, '..\\filesIds', fileName);
};

/**
 *  Write ids in to a file
 *
 * @param ids
 * @param name
 */
exports.writeToFileIds = function (ids, name) {
    let idsString = ids.toString().replace(/,/g, '\n');
    let file = getFilePath(name);
    fs.appendFileSync(file, idsString + '\n');
};

exports.deleteFile = function (name) {

    let file = getFilePath(name);

    fs.exists(file, (exists) => {
        if (exists) {
            fs.unlinkSync(file);
        } else {
            try {
                fs.mkdirSync(path.dirname(file), (err) => {
                    if (err) throw err;
                });
            } catch (e) {
                if (e.code !== 'EEXIST') throw e;
            }
        }
    });
};

exports.parseLogLinesIds = function (log_lines, fileName) {
    let ids = [];

    log_lines.forEach(function (obj) {
        ids.push(obj._id);
    });

    if (ids.length > 0)
        writeToFileIds(ids, fileName);
};

exports.parseLogLines = function (log_lines) {

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
exports.getLine = function (matchNum, fileName, matchFileName, matchOnly) {

    let file = getFilePath(fileName);
    let matchFile = getFilePath(matchFileName);

    let results = fs.readFileSync(file, 'utf8');
    let matches = fs.readFileSync(matchFile, 'utf8');

    let resultLines = results.split('\n');
    resultLines.pop();

    let matchLines = matches.split('\n');
    matchLines.pop();

    return {
        position: resultLines.indexOf(matchLines[matchNum]),
        total: matchOnly ? matchLines.length : resultLines.length
    };
};

exports.getPage = function (pageNum, size, fileName) {

    size = parseInt(size);

    if (pageNum !== undefined && !Array.isArray(pageNum)) {
        pageNum = [pageNum];
    }

    let file = getFilePath(fileName);

    let data;

    try {
        data = fs.readFileSync(file, 'utf8');
    } catch (err) {
        throw new Error('No results to show');
    }
    let lines = data.split('\n');
    lines.pop();

    let ids = [];

    pageNum = pageNum.filter(function (elem, index, self) {
        return index === self.indexOf(elem);
    });

    pageNum.forEach((num) => {

        num = parseInt(num);

        num = num < 0 ? 0 : num;

        let totalPages = Math.ceil(lines.length / size) - 1;

        num = num >= totalPages ? totalPages : num;

        if (num > lines.length) {
            throw new Error('File end reached without finding line');
        }

        let top = (num * size + size);

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

exports.requestMorePages = function (scrollId, fileName, callback) {

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

exports.requestPageHandler = function (req, reply) {

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

exports.getSort = function (type) {

    let sortType = {};

    sortType[type] = {
        "order": "asc"
    };

    return sortType;
};
