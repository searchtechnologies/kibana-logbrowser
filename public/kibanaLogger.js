/**
 * Created by ealvarado on 6/9/2016.
 */

const $ = require('jquery');
const _ = require('lodash');
const moment = require('moment');
const angular = require('angular');
const chrome = require('ui/chrome');
const modules = require('ui/modules');

const indexView = require('plugins/log_browser/views/index.html');

require('plugins/log_browser/less/bootstrap-custom.less');
require('plugins/log_browser/less/log_browser.css');
require('plugins/log_browser/less/pagination.less');
require('plugins/log_browser/less/slider-custom.less');

require('plugins/log_browser/lib/font-awesome/css/font-awesome.min.css');

require('plugins/log_browser/lib/lodash/dist/lodash.min.js');
require('plugins/log_browser/lib/angularjs-slider/dist/rzslider.min.js');
require('plugins/log_browser/lib/angular-sanitize/angular-sanitize.min.js');

require('plugins/log_browser/overwrite/pagination.js');

const app = require('ui/modules').get('app/log_browser', ['ui.bootstrap', 'ui.bootstrap.pagination', 'rzModule', 'ngSanitize']);

app
  .service('kibanaLoggerSvc', function ($http) {

    var timestamp = new Date().getTime();

    var root = this;

    this.options = {
      date: undefined,
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
      pageSize: 50,
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

      $http.get('/api/log_browser/indices/' + root.options.date.date).then((response) => {

        while (root.indices.length > 0)
          root.indices.pop();

        if (response.data.indices.length > 0) {

          //Sort Indices
          response.data.indices = response.data.indices.sort((a,b) => {
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

      $http.get('/api/log_browser/serverTypes/' + root.options.index.id).then((response) => {

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

      $http.get('/api/log_browser/servers/' + root.options.index.id + '/' + root.options.serverType.id).then((response) => {

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

      $http.get('/api/log_browser/files/' + root.options.index.id + '/' + root.options.serverType.id, {
        params: {
          servers: root.options.servers
        }
      }).then((response) => {

        while (root.fileList.length > 0)
          root.fileList.pop();

        if(!preserve) {
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

      $http.get('/api/log_browser/browse', {
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

      $http.get('/api/log_browser/browsePages', {
        params: {
          index: root.options.index.id,
          serverType: root.options.serverType.id,
          pageSize: root.pagination.pageSize,
          sortType: root.pagination.sortType.opt,
          files: root.options.files,
          servers: root.options.servers,
          timestamp: timestamp
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
    if(root.pagination.query.trim() === "")
        root.pagination.onlyMatchLines = false;

      $http.get('/api/log_browser/find', {
        params: {
          index: root.options.index.id,
          serverType: root.options.serverType.id,
          sortType: root.pagination.sortType.opt,
          query: root.pagination.query,
          files: root.options.files,
          servers: root.options.servers,
          timestamp: timestamp
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

      $http.get('/api/log_browser/findOne', {
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

  })

  .controller('kibanaLogger', ['$scope', 'kibanaLoggerSvc', function ($scope, kibanaLoggerSvc) {

    $scope.loadBrowse = function () {
      kibanaLoggerSvc.getAllLogPages();
    };

      $scope.options = kibanaLoggerSvc.options;

  }])

  .controller('kibanaLoggerBrowser', ['$scope', 'kibanaLoggerSvc', function ($scope, kibanaLoggerSvc) {

    $('#log-line-container').scroll(function() {


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

    $scope.pagination = kibanaLoggerSvc.pagination;
    $scope.pagination.sortType = $scope.sortTypes[0];

    $scope.inMemoryEntries = kibanaLoggerSvc.inMemoryEntries;

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
      floor: 50,
      ceil: 500,
      step: 50,
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

      kibanaLoggerSvc.findOne(loadBuffer);
    };

    $scope.options = kibanaLoggerSvc.options;

    /****************************************
     * Utilities
     ****************************************/

    var previousLine = 0;

    var fillBuffer = function () {

      var active = $scope.inMemoryEntries.position % $scope.pagination.pageSize;

      var index = $scope.inMemoryEntries.position - active;
      index = index < 0 ? 0 : index;
      index = index >= $scope.inMemoryEntries.entries.length ? $scope.inMemoryEntries.entries.length : index;

      $scope.inMemoryEntries.pageSize = 0;

      $scope.buffer.forEach((obj) => {


        if ($scope.inMemoryEntries.entries.length > index) {

          Object.keys($scope.inMemoryEntries.entries[index]).forEach((key)=> {
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

    var loadBuffer = function (renew) {

      $scope.sliderLines.ceil = $scope.pagination.total - 1;

      $scope.pagination.line = $scope.pagination.line || 0;

      var steps = $scope.pagination.line - previousLine;

      var beyond = (($scope.pagination.line - previousLine > $scope.pagination.pageSize)
      || (previousLine - $scope.pagination.line > $scope.pagination.pageSize)
      || renew
      || ($scope.inMemoryEntries.position + steps >= $scope.inMemoryEntries.entries.length)
      || ($scope.inMemoryEntries.position + steps < 0));

      previousLine = $scope.pagination.line + 0;


      var current = 0, currentPage = 0;

      /* If it is beyond the page size *********************************************************************************/

      if (beyond) {

        while ($scope.inMemoryEntries.entries.length > 0)
          $scope.inMemoryEntries.entries.pop();

        current = $scope.pagination.line;
        currentPage = Math.floor(current / $scope.pagination.pageSize);

        var pagesToFetch = [currentPage];

        kibanaLoggerSvc.getLogLines(pagesToFetch, false, () => {

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

    var buildBuffer = function () {

      while ($scope.buffer.length > 0)
        $scope.buffer.pop();

      for (let i = 0; i < $scope.pagination.pageSize; i++)
        $scope.buffer.push({id: i});
    };

    var entryPosition = function (steps) {

      let reset = $scope.inMemoryEntries.position % $scope.pagination.pageSize;

      if ($scope.inMemoryEntries.position !== 0)
        $scope.inMemoryEntries.position -= reset;

      $scope.inMemoryEntries.position += $scope.pagination.line % $scope.pagination.pageSize;

      $scope.inMemoryEntries.position = $scope.inMemoryEntries.position >= $scope.inMemoryEntries.entries.length ? $scope.inMemoryEntries.entries.length - 1 : $scope.inMemoryEntries.position;
      $scope.inMemoryEntries.position = $scope.inMemoryEntries.position < 0 ? 0 : $scope.inMemoryEntries.position;
    };

    var resetBrowser = function () {
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

    $scope.getAllLogPages = kibanaLoggerSvc.getAllLogPages;

    $scope.loadMore = loadBuffer;

    $scope.findOneNext = (match) => {

      match = match < $scope.pagination.totalMatches ? match : 0;
      match = match >= 0 ? match : $scope.pagination.totalMatches - 1;

      $scope.pagination.currentMatch = match;

      kibanaLoggerSvc.findOne(loadBuffer);
    };

    $scope.debouncedFindMatches = _.debounce(() => {
      kibanaLoggerSvc.findMatches(()=> {
        kibanaLoggerSvc.findOne(loadBuffer)
      }, loadBuffer);
    }, 500);

    $scope.debouncedLoadBuffer = _.debounce(loadBuffer, 500);

    $scope.debouncedBuildBuffer = _.debounce(() => {
      buildBuffer();

      while ($scope.inMemoryEntries.entries.length > 0) {
        $scope.inMemoryEntries.entries.pop();
      }

      resetBrowser();

      kibanaLoggerSvc.getLogLines([0], false, () => {

        $scope.sliderLines.ceil = $scope.pagination.total - 1;

        fillBuffer()
      });
    }, 500);

    buildBuffer();

    /****************************************
     * Listeners
     ****************************************/

    kibanaLoggerSvc.onLoadLogPages = (error) => {

      $scope.sliderLines.disabled = false;
      $scope.sliderPageSize.disabled = false;

      resetBrowser();

      while ($scope.inMemoryEntries.entries.length > 0) {
        $scope.inMemoryEntries.entries.pop();
      }

      if(!error) {

        kibanaLoggerSvc.getLogLines([0], false, () => {

          $scope.sliderLines.ceil = $scope.pagination.total - 1;

          fillBuffer()
        });
      }
    };

    kibanaLoggerSvc.beforeLoadLogPages = () => {

      $scope.sliderLines.disabled = true;
      $scope.sliderPageSize.disabled = true;
      buildBuffer();
    };

    kibanaLoggerSvc.loadBuffer = loadBuffer;
  }])

  .controller('kibanaLoggerSetting', ['$scope', 'kibanaLoggerSvc', function ($scope, kibanaLoggerSvc) {

    $scope.indices = kibanaLoggerSvc.indices;

    var today = moment().startOf('day');

    $scope.timeRanges = [{
      name: today.format('MMM, dddd DD') + ' (Today)',
      date: today.format('YYYY.MM.DD')
    }];

    for (let i = 1; i < 31; i++) {

      var day = moment(today).subtract(i, 'days');

      $scope.timeRanges.push({
        name: day.format('MMM, dddd DD'),
        date: day.format('YYYY.MM.DD')
      });
    }

    //Server List

    $scope.serverTypes = kibanaLoggerSvc.serverTypes;

    $scope.serverList = kibanaLoggerSvc.serverList;

    $scope.fileList = kibanaLoggerSvc.fileList;

    $scope.buffer = [];


    $scope.serverSelectAll = () => {

      while($scope.options.servers.length > 0)
        $scope.options.servers.pop();

      $scope.serverList.forEach((server) => {
        server.active = true;
        $scope.options.servers.push(server.id);
      });

      kibanaLoggerSvc.debouncedGetFiles();
    };

    $scope.serverDeselectAll = () => {

      while($scope.options.servers.length > 0)
        $scope.options.servers.pop();

      $scope.serverList.forEach((server) => {
        server.active = false;
      });

      while($scope.options.files.length > 0)
        $scope.options.files.pop();

      while($scope.fileList.length > 0)
        $scope.fileList.pop();
    };

    $scope.fileSelectAll = () => {

      while($scope.options.files.length > 0)
        $scope.options.files.pop();

      $scope.fileList.forEach((file) => {
        file.active = true;
        $scope.options.files.push(file.id);
      });

    };

    $scope.fileDeselectAll = () => {

      while($scope.options.files.length > 0)
        $scope.options.files.pop();

      $scope.fileList.forEach((file) => {
        file.active = false;
      });

    };

    /**
     * Set Defaults
     */



    $scope.getServerTypes = ()=> {
      kibanaLoggerSvc.getServerTypes(() => {
        kibanaLoggerSvc.getServers(() => {
          kibanaLoggerSvc.debouncedGetFiles();
        });
      });
    };

    $scope.getServers = () => {
      kibanaLoggerSvc.getServers(() => {
        kibanaLoggerSvc.debouncedGetFiles();
      });
    };

    $scope.$watch('serverList', (newVal, oldVal) => {


      if(newVal.length !== oldVal.length) {
        kibanaLoggerSvc.debouncedGetFiles();
        return;
      }

      var check = false;

      for(let i = 0; i < newVal.length; i++) {

        if(newVal[i].id !== oldVal[i].id) {
          check = true;
        }
      }

      if(check)
        kibanaLoggerSvc.debouncedGetFiles();
    }, true);

    $scope.options = kibanaLoggerSvc.options;

    $scope.options.date = $scope.timeRanges[0];

    $scope.getIndices = ()=> {
      kibanaLoggerSvc.getIndices(() => {
        kibanaLoggerSvc.getServerTypes(() => {
          kibanaLoggerSvc.getServers(() => {
            kibanaLoggerSvc.debouncedGetFiles();
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
      controller: ['$scope', 'kibanaLoggerSvc', function ($scope, kibanaLoggerSvc) {

        var i = 0;

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

            if (kibanaLoggerSvc.options.servers.length === 0) {
              while (kibanaLoggerSvc.fileList.length > 0)
                kibanaLoggerSvc.fileList.pop();

              while (kibanaLoggerSvc.options.files.length > 0)
                kibanaLoggerSvc.options.files.pop();

              return;
            }
            kibanaLoggerSvc.debouncedGetFiles(undefined, true);
          }
        }

      }]
    }

  })

  .filter('fltrSearch', function () {

    return function (items, field, searchFilter) {

      var result = [];

      if (!searchFilter) {
        return items;
      }

      try {

        // Regex with the search value
        var patt = new RegExp(searchFilter, "i");

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
  .setBrand({
    logo: 'url(/plugins/log_browser/iconL.png) left no-repeat'
  })
  .setNavBackground('#222222')
  .setRootTemplate(indexView)
  .setRootController('kibanaLogger');
