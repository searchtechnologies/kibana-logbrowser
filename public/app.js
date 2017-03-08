/**
 * Created by ealvarado on 6/9/2016.
 */
import $ from "jquery";
import _ from "lodash";
import moment from "moment";
import angular from "angular";
import chrome from "ui/chrome";
import modules from "ui/modules";
import "ui/autoload/styles";
import indexView from "plugins/log_browser/views/index.html";
import "plugins/log_browser/less/bootstrap-custom.less";
import "plugins/log_browser/less/log_browser.less";
import "plugins/log_browser/less/pagination.less";
import "plugins/log_browser/less/slider-custom.less";
import "plugins/log_browser/lib/font-awesome/css/font-awesome.min.css";
import "plugins/log_browser/lib/lodash/dist/lodash.min.js";
import "plugins/log_browser/lib/angularjs-slider/dist/rzslider.min.js";
import "plugins/log_browser/lib/angular-sanitize/angular-sanitize.min.js";
import "plugins/log_browser/lib/angular-bootstrap/ui-bootstrap-tpls.min.js";

import 'plugins/log_browser/overwrite/pagination.js';


const app = modules.get('app/log_browser', ['ui.bootstrap', 'ui.bootstrap.pagination', 'rzModule', 'ngSanitize']);
//const app = modules.get('app/log_browser', ['rzModule', 'ngSanitize']);

app
    .service('logBrowserSvc', ['$http', '$location', function ($http, $location) {

        const _this = this;

        _this.baseUrl = $location.absUrl().match(/(?:\/\w+)(?=\/)/)[0];
        _this.baseUrl = '/app' === _this.baseUrl ? '' : _this.baseUrl;

        let timestamp = new Date().getTime();

        let root = this;

        this.options = {
            date: undefined,
            timeStart: {
                use: true,
                hour: 0,
                minute: 0
            },
            timeEnd: {
                use: true,
                hour: 23,
                minute: 59
            },
            index: undefined,
            serverType: undefined,
            servers: [],
            files: [],
            loading: false
        };

        this.serverList = [];

        this.pagination = {
            total: 0,
            sortType: undefined,
            line: 0,
            maxSize: 5,
            pageSize: 25,
            query: '',
            totalMatches: 0,
            currentMatch: -1,
            onlyMatchLines: false
        };

        this.indices = [];

        this.serverTypes = [];

        this.fileList = [];

        this.inMemoryEntries = {
            position: 0,
            entries: [],
            pageSize: 0
        };

        this.getIndices = function (callback) {

            $http.get(_this.baseUrl + '/api/log_browser/indices/' + root.options.date.date).then((response) => {

                while (root.indices.length > 0)
                    root.indices.pop();

                if (response.data.indices.length > 0) {

                    //Sort Indices
                    response.data.indices = response.data.indices.sort((a, b) => {
                        if (a.name < b.name)
                            return -1;
                        if (a.name > b.name)
                            return 1;

                        return 0;
                    });

                    response.data.indices.forEach(function (obj) {
                        root.indices.push(obj)
                    });

                    if (root.indices.length > 0)
                        root.options.index = root.indices[0];

                    if (callback)
                        callback();
                } else {
                    while (root.serverTypes.length > 0)
                        root.serverTypes.pop();

                    while (root.serverList.length > 0)
                        root.serverList.pop();

                    while (root.fileList.length > 0)
                        root.fileList.pop();

                    root.options.index = undefined;
                    root.options.serverType = undefined;

                    while (root.options.servers.length > 0)
                        root.options.servers.pop();

                    while (root.options.files.length > 0)
                        root.options.files.pop();

                }
            }, (error) => {

                console.log(error);
            });
        };

        this.getServerTypes = function (callback) {

            $http.get(_this.baseUrl + '/api/log_browser/serverTypes/' + root.options.index.id).then((response) => {

                while (root.serverTypes.length > 0)
                    root.serverTypes.pop();

                response.data.serverTypes.forEach(function (obj) {
                    root.serverTypes.push(obj)
                });

                if (root.serverTypes.length > 0)
                    root.options.serverType = root.serverTypes[0];

                if (callback);
                    callback()
            }, (error) => {

                console.log(error);
            });
        };

        this.getServers = function (callback) {

            $http.get(_this.baseUrl + '/api/log_browser/servers/' + root.options.index.id + '/' + root.options.serverType.id).then((response) => {

                while (root.serverList.length > 0)
                    root.serverList.pop();

                while (root.options.servers.length > 0)
                    root.options.servers.pop();

                response.data.servers.forEach((server) => {
                    root.serverList.push({
                        id: server.id,
                        name: server.name
                    })
                });

                if (root.serverList.length > 0)
                    root.options.servers.push(root.serverList[0].id);


                if (callback)
                    callback();

            }, (error) => {

                console.log(error);
            });
        };

        this.getFiles = function (callback, preserve) {

            if (root.options.servers.length === 0) {
                while (root.fileList.length > 0)
                    root.fileList.pop();

                while (root.options.files.length > 0)
                    root.options.files.pop();

                return;
            }

            $http.get(_this.baseUrl + '/api/log_browser/files/' + root.options.index.id + '/' + root.options.serverType.id, {
                params: {
                    servers: root.options.servers
                }
            }).then((response) => {

                while (root.fileList.length > 0)
                    root.fileList.pop();

                if (!preserve) {
                    while (root.options.files.length > 0)
                        root.options.files.pop();
                }

                response.data.files.forEach((file) => {
                    root.fileList.push({
                        id: file.id,
                        name: file.name
                    })
                });

                //root.options.files.push(root.fileList[0].id);
            }, (error) => {

                console.log(error);
            });

        };

        this.debouncedGetFiles = _.debounce(this.getFiles, 250);

        this.getLogLines = function (page, front, callback) {

            if (page !== undefined && !Array.isArray(page)) {
                page = [page];
            }

            $http.get(_this.baseUrl + '/api/log_browser/browse', {
                params: {
                    index: root.options.index.id,
                    serverType: root.options.serverType.id,
                    pageSize: root.pagination.pageSize,
                    sortType: root.pagination.sortType.opt,
                    query: root.pagination.query,
                    page: page,
                    onlyMatchLines: root.pagination.onlyMatchLines,
                    timestamp: timestamp
                }
            }).then((response) => {

                if (response.data.error) {
                    alert(response.data.error.msg);
                    root.options.loading = false;
                    return;
                }

                if (response.data.total)
                    root.pagination.total = response.data.total;

                if (front) {
                    response.data.lines.reverse().forEach((line) => {
                        root.inMemoryEntries.entries.unshift(line);
                        root.inMemoryEntries.position++;
                    });
                } else {
                    response.data.lines.forEach((line) => {
                        root.inMemoryEntries.entries.push(line);
                    });
                }

                if (callback) {
                    callback();
                }
            }, (error) => {

                console.log(error);
            });

        };

        this.getAllLogPages = function () {

            root.beforeLoadLogPages();

            root.options.loading = true;

            $http.get(_this.baseUrl + '/api/log_browser/browsePages', {
                params: {
                    index: root.options.index.id,
                    serverType: root.options.serverType.id,
                    pageSize: root.pagination.pageSize,
                    sortType: root.pagination.sortType.opt,
                    files: root.options.files,
                    servers: root.options.servers,
                    timestamp: timestamp,
                    startTime: root.options.timeStart,
                    endTime: root.options.timeEnd,
                    date: root.options.date.date
                }
            }).then((response) => {

                if (response.data.error) {
                    alert(response.data.error.msg);
                    root.options.loading = false;
                    return;
                }

                while (root.inMemoryEntries.entries.length > 0)
                    root.inMemoryEntries.entries.pop();

                if (response.data.total !== undefined) {
                    root.pagination.total = response.data.total;
                }

                root.options.loading = false;

                root.onLoadLogPages();
            }, (error) => {

                root.options.loading = false;

                root.onLoadLogPages(true);
                console.log(error);
            });
        };

        this.findMatches = function (callback, no_resp_callback) {
            if (root.pagination.query.trim() === "")
                root.pagination.onlyMatchLines = false;

            $http.get(_this.baseUrl + '/api/log_browser/find', {
                params: {
                    index: root.options.index.id,
                    serverType: root.options.serverType.id,
                    sortType: root.pagination.sortType.opt,
                    query: root.pagination.query,
                    files: root.options.files,
                    servers: root.options.servers,
                    timestamp: timestamp,
                    startTime: root.options.timeStart,
                    endTime: root.options.timeEnd,
                    date: root.options.date.date
                }
            }).then((response) => {

                if (response.data.total !== undefined) {
                    root.pagination.totalMatches = response.data.total;

                    if (root.pagination.totalMatches > 0) {
                        root.pagination.currentMatch = 0;

                        if (callback)
                            callback();

                    } else {
                        root.pagination.currentMatch = -1;

                        if (no_resp_callback)
                            no_resp_callback(true);
                    }
                }

            }, (error) => {

                console.log(error);
            });
        };

        this.findOne = function (callback) {

            $http.get(_this.baseUrl + '/api/log_browser/findOne', {
                params: {
                    match: root.pagination.currentMatch,
                    onlyMatchLines: root.pagination.onlyMatchLines,
                    timestamp: timestamp
                }
            }).then((response) => {

                root.pagination.line = response.data.position;
                root.pagination.total = response.data.total;

                if (callback)
                    callback(true);

            }, (error) => {

                console.log(error);
            });

        };

    }])

    .controller('logBrowser', ['$scope', 'logBrowserSvc', function ($scope, logBrowserSvc) {

        $scope.loadBrowse = function () {
            logBrowserSvc.getAllLogPages();
        };

        $scope.options = logBrowserSvc.options;

    }])

    .controller('logBrowserBrowser', ['$scope', 'logBrowserSvc', function ($scope, logBrowserSvc) {

        $('#log-line-container').scroll(function () {


            console.log($('#log-line-container').scrollLeft());

            $('#log-line-header').css('left', $('#log-line-container').scrollLeft() * -1)

        });

        $scope.sortTypes = [
            {
                name: 'Ingestion Timestamp',
                opt: '@timestamp'
            },
            {
                name: 'File Timestamp',
                opt: 'log_time'
            },
            {
                name: 'First 40 characters',
                opt: 'message40'
            }
        ];

        $scope.pagination = logBrowserSvc.pagination;
        $scope.pagination.sortType = $scope.sortTypes[0];

        $scope.inMemoryEntries = logBrowserSvc.inMemoryEntries;

        $scope.wrap = false;

        $scope.sliderLines = {
            floor: 0,
            ceil: 1,
            step: 1,
            interval: 350,
            vertical: true,
            keyboardSupport: true,
            scale: 1,
            onStart: null,
            onChange: () => {
                $scope.debouncedLoadBuffer();
            },
            onEnd: null,
            rightToLeft: true
        };

        $scope.sliderPageSize = {
            floor: 25,
            ceil: 250,
            step: 25,
            interval: 350,
            vertical: false,
            keyboardSupport: true,
            showTicks: true,
            scale: 1,
            onStart: null,
            onChange: () => {
                $scope.debouncedBuildBuffer();
            },
            onEnd: null,
            rightToLeft: false
        };

        $scope.buffer = [];

        $scope.toogleWrap = function () {
            $scope.wrap = !$scope.wrap;
        };

        $scope.toggleOnlyMatchLines = function () {

            $scope.pagination.onlyMatchLines = !$scope.pagination.onlyMatchLines;

            $scope.pagination.line = 0;
            $scope.pagination.total = 0;
            $scope.sliderLines.ceil = 0;
            previousLine = 0;
            $scope.inMemoryEntries.position = 0;

            while ($scope.inMemoryEntries.entries.length > 0)
                $scope.inMemoryEntries.entries.pop();

            logBrowserSvc.findOne(loadBuffer);
        };

        $scope.options = logBrowserSvc.options;

        /****************************************
         * Utilities
         ****************************************/

        let previousLine = 0;

        let fillBuffer = function () {

            let active = $scope.inMemoryEntries.position % $scope.pagination.pageSize;

            let index = $scope.inMemoryEntries.position - active;
            index = index < 0 ? 0 : index;
            index = index >= $scope.inMemoryEntries.entries.length ? $scope.inMemoryEntries.entries.length : index;

            $scope.inMemoryEntries.pageSize = 0;

            $scope.buffer.forEach((obj) => {


                if ($scope.inMemoryEntries.entries.length > index) {

                    Object.keys($scope.inMemoryEntries.entries[index]).forEach((key) => {
                        obj[key] = $scope.inMemoryEntries.entries[index][key];
                    });

                    $scope.inMemoryEntries.pageSize++;

                } else {
                    Object.keys(obj).forEach((key) => {
                        delete obj[key];
                    });

                    obj.id = index;
                }

                obj.active = index === $scope.inMemoryEntries.position;

                index++;
            });
        };

        let loadBuffer = function (renew) {

            $scope.sliderLines.ceil = $scope.pagination.total - 1;

            $scope.pagination.line = $scope.pagination.line || 0;

            let steps = $scope.pagination.line - previousLine;

            let beyond = (($scope.pagination.line - previousLine > $scope.pagination.pageSize)
            || (previousLine - $scope.pagination.line > $scope.pagination.pageSize)
            || renew
            || ($scope.inMemoryEntries.position + steps >= $scope.inMemoryEntries.entries.length)
            || ($scope.inMemoryEntries.position + steps < 0));

            previousLine = $scope.pagination.line + 0;


            let current = 0, currentPage = 0;

            /* If it is beyond the page size *********************************************************************************/

            if (beyond) {

                while ($scope.inMemoryEntries.entries.length > 0)
                    $scope.inMemoryEntries.entries.pop();

                current = $scope.pagination.line;
                currentPage = Math.floor(current / $scope.pagination.pageSize);

                let pagesToFetch = [currentPage];

                logBrowserSvc.getLogLines(pagesToFetch, false, () => {

                    pagesToFetch = pagesToFetch.filter(function (elem, index, self) {
                        return index == self.indexOf(elem);
                    });

                    $scope.inMemoryEntries.position = 0;
                    entryPosition(steps);

                    fillBuffer();
                });

                return;
            }

            /* Move inside memory *******************************************************************************************/

            $scope.inMemoryEntries.position += steps;
            entryPosition(steps);

            buildBuffer();
            fillBuffer();

        };

        let buildBuffer = function () {

            while ($scope.buffer.length > 0)
                $scope.buffer.pop();

            for (let i = 0; i < $scope.pagination.pageSize; i++)
                $scope.buffer.push({id: i});
        };

        let entryPosition = function (steps) {

            let reset = $scope.inMemoryEntries.position % $scope.pagination.pageSize;

            if ($scope.inMemoryEntries.position !== 0)
                $scope.inMemoryEntries.position -= reset;

            $scope.inMemoryEntries.position += $scope.pagination.line % $scope.pagination.pageSize;

            $scope.inMemoryEntries.position = $scope.inMemoryEntries.position >= $scope.inMemoryEntries.entries.length ? $scope.inMemoryEntries.entries.length - 1 : $scope.inMemoryEntries.position;
            $scope.inMemoryEntries.position = $scope.inMemoryEntries.position < 0 ? 0 : $scope.inMemoryEntries.position;
        };

        let resetBrowser = function () {
            $scope.pagination.line = 0;
            $scope.pagination.total = 0;
            $scope.pagination.totalMatches = 0;
            $scope.pagination.currentMatch = -1;
            $scope.pagination.query = '';
            previousLine = 0;
            $scope.inMemoryEntries.position = 0;
            $scope.onlyMatchLines = false;

            $scope.sliderLines.ceil = 0;

        };

        /****************************************
         * Initializations
         ****************************************/

        $scope.getAllLogPages = logBrowserSvc.getAllLogPages;

        $scope.loadMore = loadBuffer;

        $scope.findOneNext = (match) => {

            match = match < $scope.pagination.totalMatches ? match : 0;
            match = match >= 0 ? match : $scope.pagination.totalMatches - 1;

            $scope.pagination.currentMatch = match;

            logBrowserSvc.findOne(loadBuffer);
        };

        $scope.debouncedFindMatches = _.debounce(() => {
            logBrowserSvc.findMatches(() => {
                logBrowserSvc.findOne(loadBuffer)
            }, loadBuffer);
        }, 500);

        $scope.debouncedLoadBuffer = _.debounce(loadBuffer, 500);

        $scope.debouncedBuildBuffer = _.debounce(() => {
            buildBuffer();

            while ($scope.inMemoryEntries.entries.length > 0) {
                $scope.inMemoryEntries.entries.pop();
            }

            resetBrowser();

            logBrowserSvc.getLogLines([0], false, () => {

                $scope.sliderLines.ceil = $scope.pagination.total - 1;

                fillBuffer()
            });
        }, 500);

        buildBuffer();

        /****************************************
         * Listeners
         ****************************************/

        logBrowserSvc.onLoadLogPages = (error) => {

            $scope.sliderLines.disabled = false;
            $scope.sliderPageSize.disabled = false;

            resetBrowser();

            while ($scope.inMemoryEntries.entries.length > 0) {
                $scope.inMemoryEntries.entries.pop();
            }

            if (!error) {

                logBrowserSvc.getLogLines([0], false, () => {

                    $scope.sliderLines.ceil = $scope.pagination.total - 1;

                    fillBuffer()
                });
            }
        };

        logBrowserSvc.beforeLoadLogPages = () => {

            $scope.sliderLines.disabled = true;
            $scope.sliderPageSize.disabled = true;
            buildBuffer();
        };

        logBrowserSvc.loadBuffer = loadBuffer;
    }])

    .controller('logBrowserSetting', ['$scope', 'logBrowserSvc', function ($scope, logBrowserSvc) {

        $scope.indices = logBrowserSvc.indices;

        $scope.time = {
            hours: [],
            minutes: []
        };

        for (let i = 0; i < 24; i++) {
            $scope.time.hours.push(i)
        }

        for (let i = 0; i < 60; i++) {
            $scope.time.minutes.push(i)
        }

        let today = moment().zone(0).startOf('day');

        $scope.timeRanges = [{
            name: today.format('MMM, dddd DD') + ' (Today)',
            date: today.format('YYYY.MM.DD')
        }];

        for (let i = 1; i < 31; i++) {

            let day = moment(today).zone(0).subtract(i, 'days');

            $scope.timeRanges.push({
                name: day.format('MMM, dddd DD'),
                date: day.format('YYYY.MM.DD')
            });
        }

        //Server List

        $scope.serverTypes = logBrowserSvc.serverTypes;

        $scope.serverList = logBrowserSvc.serverList;

        $scope.fileList = logBrowserSvc.fileList;

        $scope.buffer = [];


        $scope.serverSelectAll = () => {

            while ($scope.options.servers.length > 0)
                $scope.options.servers.pop();

            $scope.serverList.forEach((server) => {
                server.active = true;
                $scope.options.servers.push(server.id);
            });

            logBrowserSvc.debouncedGetFiles();
        };

        $scope.serverDeselectAll = () => {

            while ($scope.options.servers.length > 0)
                $scope.options.servers.pop();

            $scope.serverList.forEach((server) => {
                server.active = false;
            });

            while ($scope.options.files.length > 0)
                $scope.options.files.pop();

            while ($scope.fileList.length > 0)
                $scope.fileList.pop();
        };

        $scope.fileSelectAll = () => {

            while ($scope.options.files.length > 0)
                $scope.options.files.pop();

            $scope.fileList.forEach((file) => {
                file.active = true;
                $scope.options.files.push(file.id);
            });

        };

        $scope.fileDeselectAll = () => {

            while ($scope.options.files.length > 0)
                $scope.options.files.pop();

            $scope.fileList.forEach((file) => {
                file.active = false;
            });

        };

        /**
         * Set Defaults
         */



        $scope.getServerTypes = () => {
            logBrowserSvc.getServerTypes(() => {
                logBrowserSvc.getServers(() => {
                    logBrowserSvc.debouncedGetFiles();
                });
            });
        };

        $scope.getServers = () => {
            logBrowserSvc.getServers(() => {
                logBrowserSvc.debouncedGetFiles();
            });
        };

        $scope.$watch('serverList', (newVal, oldVal) => {


            if (newVal.length !== oldVal.length) {
                logBrowserSvc.debouncedGetFiles();
                return;
            }

            let check = false;

            for (let i = 0; i < newVal.length; i++) {

                if (newVal[i].id !== oldVal[i].id) {
                    check = true;
                }
            }

            if (check)
                logBrowserSvc.debouncedGetFiles();
        }, true);

        $scope.options = logBrowserSvc.options;

        $scope.options.date = $scope.timeRanges[0];

        $scope.getIndices = () => {
            logBrowserSvc.getIndices(() => {
                logBrowserSvc.getServerTypes(() => {
                    logBrowserSvc.getServers(() => {
                        logBrowserSvc.debouncedGetFiles();
                    })
                });
            });
        };

        $scope.getIndices();

    }])

    .directive('item', function () {

        return {
            restrict: 'E',
            scope: {
                list: '=',
                item: '=',
                itemType: '@'
            },
            template: '<a class="col-sm-12 text-center item" href="" ng-bind="item.name" ng-class="{active: item.active}" ng-click="toggle()"></a>',
            controller: ['$scope', 'logBrowserSvc', function ($scope, logBrowserSvc) {

                let i = 0;

                for (i = 0; i < $scope.list.length; i++) {

                    if (JSON.stringify($scope.item.id) === JSON.stringify($scope.list[i])) {
                        $scope.item.active = true;
                        break;
                    }
                }

                $scope.toggle = function () {

                    if ($scope.item.active) {

                        for (i = 0; i < $scope.list.length; i++) {

                            if ($scope.item.id === $scope.list[i]) {
                                $scope.list.splice(i, 1);
                                $scope.item.active = false;
                            }
                        }

                    } else {
                        $scope.list.push($scope.item.id);
                        $scope.item.active = true;
                    }

                    if ($scope.itemType === 'host') {

                        if (logBrowserSvc.options.servers.length === 0) {
                            while (logBrowserSvc.fileList.length > 0)
                                logBrowserSvc.fileList.pop();

                            while (logBrowserSvc.options.files.length > 0)
                                logBrowserSvc.options.files.pop();

                            return;
                        }
                        logBrowserSvc.debouncedGetFiles(undefined, true);
                    }
                }

            }]
        }

    })

    .filter('fltrSearch', function () {

        return function (items, field, searchFilter) {

            let result = [];

            if (!searchFilter) {
                return items;
            }

            try {

                // Regex with the search value
                let patt = new RegExp(searchFilter, "i");

                // Loop through all the content sources and groups
                angular.forEach(items, function (item) {

                    if (item[field].toLowerCase().search(patt) !== -1) {
                        result.push(item);
                    }
                });

                return result;
            }
            catch (err) {
                return result;
            }

        };

    })
    .filter('to_trusted', ['$sce', function ($sce) {
        return function (text) {
            return $sce.trustAsHtml(text);
        };
    }]);

chrome
    .setNavBackground('#222222')
    .setRootTemplate(indexView)
    .setRootController('logBrowser');
