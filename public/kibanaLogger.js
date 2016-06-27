/**
 * Created by ealvarado on 6/9/2016.
 */

const $ = require('jquery');
const _ = require('lodash');
const moment = require('moment');
const angular = require('angular');
const chrome = require('ui/chrome');
const modules = require('ui/modules');

const indexView = require('plugins/kibana_logger/views/index.html');

require('plugins/kibana_logger/less/bootstrap-custom.less');
require('plugins/kibana_logger/less/kibana_logger.less');
require('plugins/kibana_logger/less/pagination.less');
require('plugins/kibana_logger/less/slider-custom.less');

require('plugins/kibana_logger/lib/lodash/dist/lodash.min.js');
require('plugins/kibana_logger/lib/angularjs-slider/dist/rzslider.min.js');

const app = require('ui/modules').get('app/kibana_logger', ['ui.bootstrap', 'ui.bootstrap.pagination', 'rzModule']);

app
  .service('kibanaLoggerSvc', function ($http) {

    var root = this;

    this.options = {
      time: undefined,
      index: undefined,
      serverType: undefined,
      servers: [],
      files: []
    };

    this.pagination = {
      total: 0,
      sortType: undefined,
      line: 0,
      maxSize: 5,
      pageSize: 10
    };

    this.indices = [];

    this.serverTypes = [];

    this.inMemoryEntries = {
      position: 0,
      entries: [],
      pageSize: 0
    };

    this.getIndices = function (callback) {

      $http.get('/api/kibana_logger/indices').then((response) => {

        while (root.indices.length > 0)
          root.indices.pop();

        response.data.indices.forEach(function (obj) {
          root.indices.push(obj)
        });

        if (root.indices.length > 0)
          root.options.index = root.indices[1];

        if (callback)
          callback();
      });
    };

    this.getServers = function (callback) {

      $http.get('/api/kibana_logger/serverTypes/' + root.options.index.id).then((response) => {

        while (root.serverTypes.length > 0)
          root.serverTypes.pop();

        response.data.serverTypes.forEach(function (obj) {
          root.serverTypes.push(obj)
        });

        if (root.serverTypes.length > 0)
          root.options.serverType = root.serverTypes[0];
      });
    };

    this.getLogLines = function (page, front, callback) {

      if (page !== undefined && !Array.isArray(page)) {
        page = [page];
      }

      $http.get('/api/kibana_logger/browse', {
        params: {
          index: root.options.index.id,
          serverType: root.options.serverType.id,
          pageSize: root.pagination.pageSize,
          sortType: root.pagination.sortType.opt,
          page: page
        }
      }).then((response) => {

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
      });

    };

    this.cleanLogLines = function (front, callback) {

      var reset = root.inMemoryEntries.position % root.pagination.pageSize;


      if (front) {

        var from = root.inMemoryEntries.position - reset;
        var to = from + root.pagination.pageSize;
        to = to > root.inMemoryEntries.entries.length ? root.inMemoryEntries.entries.length : to;


        for (let i = from; i < to; i++) {
          root.inMemoryEntries.entries.pop();
        }
      } else {

        var to = root.inMemoryEntries.position - reset;
        var from = to - root.pagination.pageSize;
        from = from < 0 ? 0 : from;

        for (let i = from; i < to; i++) {
          root.inMemoryEntries.entries.shift();
          root.inMemoryEntries.position--;
        }
      }

      if (callback) {
        callback();
      }
    };

    this.moveLogLines = function (page, front, callback) {
      root.getLogLines(page, front, () => {
        root.cleanLogLines(front, callback);
      });

    };

    this.getAllLogPages = function () {

      root.pagination.page = 1;

      $http.get('/api/kibana_logger/browsePages', {
        params: {
          index: root.options.index.id,
          serverType: root.options.serverType.id,
          pageSize: root.pagination.pageSize,
          sortType: root.pagination.sortType.opt
        }
      }).then((response) => {

        if (response.data.total !== undefined) {
          root.pagination.total = response.data.total;
        }

        while (root.inMemoryEntries.entries.length > 0)
          root.inMemoryEntries.entries.pop();

        root.onLoadLogPages();

      });
    };

  })

  .controller('kibanaLogger', ['$scope', 'kibanaLoggerSvc', function ($scope, kibanaLoggerSvc) {

    kibanaLoggerSvc.getIndices(function () {
      kibanaLoggerSvc.getServers();
    });

    $scope.loadBrowse = function () {
      kibanaLoggerSvc.getAllLogPages();
    }

  }])

  .controller('kibanaLoggerBrowser', ['$scope', 'kibanaLoggerSvc', function ($scope, kibanaLoggerSvc) {

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
        opt: ''
      }
    ];

    $scope.pagination = kibanaLoggerSvc.pagination;
    $scope.pagination.sortType = $scope.sortTypes[0];

    $scope.inMemoryEntries = kibanaLoggerSvc.inMemoryEntries;

    $scope.currentPages = {
      previousPage: undefined,
      nextPage: undefined
    };

    $scope.wrap = true;
    $scope.onlyMatchLines = false;

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
      floor: 10,
      ceil: 100,
      step: 10,
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

        if (index === $scope.inMemoryEntries.position) {
          obj.active = true;
        } else {
          obj.active = false;
        }

        index++;
      });
    };

    var loadBuffer = function (renew) {

      var steps = $scope.pagination.line - previousLine;

      $scope.pagination.line = $scope.pagination.line || 0;

      var previous = $scope.pagination.line - $scope.pagination.pageSize;
      var next = $scope.pagination.line + $scope.pagination.pageSize;
      var current = $scope.pagination.line;

      next = next >= $scope.pagination.total ? $scope.pagination.total - 1 : next;
      previous = previous < 0 ? 0 : previous;

      var nextPage = Math.ceil(next / $scope.pagination.pageSize) - 1;
      var previousPage = Math.ceil(previous / $scope.pagination.pageSize) - 1;
      var currentPage = Math.ceil(current / $scope.pagination.pageSize) - 1;

      var forward = false, backward = false;

      if(steps > 0)
        forward = ($scope.inMemoryEntries.position + steps + $scope.pagination.pageSize > $scope.inMemoryEntries.entries.length) && !(currentPage === nextPage);

      if(steps < 0)
        backward = ($scope.inMemoryEntries.position + steps - $scope.pagination.pageSize < 0) && !(currentPage === previousPage);


      if (($scope.pagination.line - previousLine > $scope.pagination.pageSize) || (previousLine - $scope.pagination.line > $scope.pagination.pageSize) || renew) {

        while ($scope.inMemoryEntries.entries.length > 0)
          $scope.inMemoryEntries.entries.pop();

        var pagesToFetch = [previousPage, currentPage, nextPage];

        kibanaLoggerSvc.getLogLines(pagesToFetch, false, () => {

          pagesToFetch = pagesToFetch.filter(function (elem, index, self) {
            return index == self.indexOf(elem);
          });

          $scope.inMemoryEntries.position = pagesToFetch.indexOf(currentPage) * $scope.pagination.pageSize;
          entryPosition(steps);

          fillBuffer();
        });

      }
      else if (forward) {
        kibanaLoggerSvc.moveLogLines(nextPage, false, () => {

          $scope.inMemoryEntries.position += steps;
          entryPosition(steps);

          fillBuffer();
        });
      }
      else if (backward) {
        kibanaLoggerSvc.moveLogLines(previousPage, true, () => {

          $scope.inMemoryEntries.position += steps;
          entryPosition(steps);

          fillBuffer();
        });
      }
      else {

        $scope.inMemoryEntries.position += steps;
        entryPosition(steps);

        buildBuffer();
        fillBuffer();

      }

      previousLine = $scope.pagination.line + 0;
    };

    var buildBuffer = function () {

      while ($scope.buffer.length > 0)
        $scope.buffer.pop();

      for (let i = 0; i < $scope.pagination.pageSize; i++)
        $scope.buffer.push({id: i});
    };

    var entryPosition = function (steps) {

      let reset = $scope.inMemoryEntries.position % $scope.pagination.pageSize ;

      if ($scope.inMemoryEntries.position !== 0)
        $scope.inMemoryEntries.position -= reset;

      $scope.inMemoryEntries.position += $scope.pagination.line % $scope.pagination.pageSize;

      $scope.inMemoryEntries.position = $scope.inMemoryEntries.position >= $scope.inMemoryEntries.entries.length ? $scope.inMemoryEntries.entries.length - 1 : $scope.inMemoryEntries.position;
      $scope.inMemoryEntries.position = $scope.inMemoryEntries.position < 0 ? 0 : $scope.inMemoryEntries.position;
    };

    /****************************************
     * Initializations
     ****************************************/

    $scope.loadMore = loadBuffer;

    $scope.debouncedLoadBuffer = _.debounce(loadBuffer, 300);
    $scope.debouncedBuildBuffer = _.debounce(() => {
      buildBuffer();

      $scope.pagination.line = 0;
      $scope.previousLine = 0;
      $scope.inMemoryEntries.position = 0;

      while($scope.inMemoryEntries.entries.length > 0){
        $scope.inMemoryEntries.entries.pop();
      }

      kibanaLoggerSvc.getLogLines([0, 1], false, fillBuffer);
    }, 300);

    buildBuffer();

    /****************************************
     * Listeners
     ****************************************/

    kibanaLoggerSvc.onLoadLogPages = function () {
      $scope.currentPages.previousPage = 1;
      $scope.currentPages.nextPage = 2;

      $scope.sliderLines.ceil = $scope.pagination.total - 1;
      $scope.pagination.line = 0;
      $scope.previousLine = 0;
      $scope.inMemoryEntries.position = 0;

      while($scope.inMemoryEntries.entries.length > 0){
        $scope.inMemoryEntries.entries.pop();
      }

      kibanaLoggerSvc.getLogLines([0, 1], false, fillBuffer);
    };

    kibanaLoggerSvc.loadBuffer = loadBuffer;
  }])

  .controller('kibanaLoggerSetting', ['$scope', 'kibanaLoggerSvc', function ($scope, kibanaLoggerSvc) {

    $scope.getServers = kibanaLoggerSvc.getServers;

    $scope.indices = kibanaLoggerSvc.indices;

    var today = moment().startOf('day');

    $scope.timeRanges = [{
      name: 'Today',
      date: today
    }];

    for (let i = 1; i < 15; i++) {

      var day = moment(today).subtract(i, 'days');

      $scope.timeRanges.push({
        name: day.format('MMM DD'),
        date: day
      });
    }

    //Server List

    $scope.serverTypes = kibanaLoggerSvc.serverTypes;

    $scope.serverList = [
      {
        name: 'rftcpelp01.hbc.com',
        address: ''
      },
      {
        name: 'rftcpelp02.hbc.com',
        address: ''
      },
      {
        name: 'rftcpelp03.hbc.com',
        address: ''
      },
      {
        name: 'rftmappp01',
        address: ''
      },
      {
        name: 'rftmappp02',
        address: ''
      },
      {
        name: 'rftmappp03',
        address: ''
      },
      {
        name: 'rftmappp04',
        address: ''
      },
      {
        name: 'rftuebp04',
        address: ''
      },
      {
        name: 'rftuebp05',
        address: ''
      },
      {
        name: 'rftuebp06',
        address: ''
      },
      {
        name: 'rftuebp07',
        address: ''
      },
      {
        name: 'rftuebp08',
        address: ''
      },
      {
        name: 'rftuebp09',
        address: ''
      },
      {
        name: 'rftwaappp01.hbc.com',
        address: ''
      },
      {
        name: 'rftwngp01',
        address: ''
      },
      {
        name: 'rftwngp02',
        address: ''
      },
      {
        name: 'rftwngp03',
        address: ''
      },
      {
        name: 'rftwschp01.hbc.com',
        address: ''
      },
      {
        name: 'rftwschp02.hbc.com',
        address: ''
      },
      {
        name: 'rftwschp04',
        address: ''
      },
      {
        name: 'rftwschp05',
        address: ''
      },
      {
        name: 'rftwschp06',
        address: ''
      },
      {
        name: 'rftwwapp01.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp02.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp03.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp04.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp05.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp06.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp07.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp08.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp09.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp10.hbc.com',
        address: ''
      },
      {
        name: 'rftwwapp11',
        address: ''
      },
      {
        name: 'rftwwapp12',
        address: ''
      },
      {
        name: 'rftwwebp01.hbc.com',
        address: ''
      },
      {
        name: 'rftwwebp02.hbc.com',
        address: ''
      },
      {
        name: 'rftwwebp03.hbc.com',
        address: ''
      },
      {
        name: 'sd1psvc01lx',
        address: ''
      },
      {
        name: 'sd1putl02lx',
        address: ''
      },
      {
        name: 'sd1pxx10lx',
        address: ''
      },
      {
        name: 'sd1pxx11lx',
        address: ''
      }
    ];

    $scope.fileList = [
      {
        name: 'ffdc/PRBactHBCserver11_exception.log',
        fullpath: ''
      },
      {
        name: 'nodeagent/SystemOut.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver11/native_stderr.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver12/SystemOut.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver5/SystemOut.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver7/SystemOut.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver9/SystemOut.log',
        fullpath: ''
      },
      {
        name: 'ffdc/PRBactHBCserver6_exception.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver10/SystemOut.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver11/SystemOut.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver3/SystemOut.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver6/SystemOut.log',
        fullpath: ''
      },
      {
        name: 'PRBactHBCserver8/SystemOut.log',
        fullpath: ''
      }
    ];

    $scope.buffer = [];


    /**
     * Set Defaults
     */

    $scope.options = kibanaLoggerSvc.options;
  }])

  .directive('item', function () {

    return {
      restrict: 'E',
      scope: {
        list: '=',
        item: '='
      },
      template: '<a class="col-sm-12 text-center item" href="" ng-bind="item.name" ng-class="{active: active}" ng-click="toggle()"></a>',
      controller: ['$scope', function ($scope) {

        $scope.active = false;

        var i = 0;

        for (i = 0; i < $scope.list.length; i++) {

          if (JSON.stringify(item) === JSON.stringify($scope.list[i])) {
            $scope.active = true;
            break;
          }
        }

        $scope.toggle = function () {

          if ($scope.active) {

            for (i = 0; i < $scope.list.length; i++) {

              if (JSON.stringify($scope.item) === JSON.stringify($scope.list[i])) {
                $scope.list.splice(i, 1);
                $scope.active = false;
                return;
              }
            }

          } else {
            $scope.list.push($scope.item);
            $scope.active = true;
          }
        }

      }]
    }

  })

  .filter('fltrSearch', function () {

    return function (items, field, searchFilter) {

      var result = [];
      var addGroup = false;

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

          if (item["cardType"] == "group") { // Continue checking inside the Groups
            angular.forEach(item.contentSource, function (groupItem) {

              if (groupItem[field].toLowerCase().search(patt) !== -1) {
                addGroup = true;
              }
            });

            if (addGroup && !inArray(item, result)) { // Only add the group to the result
              result.push(item);
              addGroup = false; // Reset variable to check another group
            }
          }
        });

        return result;
      }
      catch (err) {
        return result;
      }

    };

  })

  .controller('PaginationLoggerController', ['$scope', '$attrs', '$parse', function ($scope, $attrs, $parse) {
    var self = this,
      ngModelCtrl = {$setViewValue: angular.noop}, // nullModelCtrl
      setNumPages = $attrs.numPages ? $parse($attrs.numPages).assign : angular.noop;

    this.init = function (ngModelCtrl_, config) {
      ngModelCtrl = ngModelCtrl_;
      this.config = config;

      ngModelCtrl.$render = function () {
        self.render();
      };

      if ($attrs.itemsPerPage) {
        $scope.$parent.$watch($parse($attrs.itemsPerPage), function (value) {
          self.itemsPerPage = parseInt(value, 10);
          $scope.totalPages = self.calculateTotalPages() - 1;
        });
      } else {
        this.itemsPerPage = config.itemsPerPage;
      }
    };

    this.calculateTotalPages = function () {
      var totalPages = this.itemsPerPage < 1 ? 1 : Math.ceil($scope.totalItems / this.itemsPerPage);
      return Math.max(totalPages || 0, 0);
    };

    this.render = function () {
      $scope.page = parseInt(ngModelCtrl.$viewValue, 10) || 0;
    };

    $scope.selectPage = function (page) {
      if ($scope.page !== page && page >= 0 && page <= $scope.totalPages) {
        ngModelCtrl.$setViewValue(page);
        ngModelCtrl.$render();
      }
    };

    $scope.getText = function (key) {
      return $scope[key + 'Text'] || self.config[key + 'Text'];
    };
    $scope.noPrevious = function () {
      return $scope.page === 0;
    };
    $scope.noPreviousFive = function () {
      return $scope.page < 5;
    };
    $scope.noPreviousTen = function () {
      return $scope.page < 10;
    };
    $scope.noNext = function () {
      return $scope.page === $scope.totalPages;
    };
    $scope.noNextFive = function () {
      return $scope.page >= $scope.totalPages - 5;
    };
    $scope.noNextTen = function () {
      return $scope.page >= $scope.totalPages - 10;
    };

    $scope.$watch('totalItems', function () {
      $scope.totalPages = self.calculateTotalPages();
    });

    $scope.$watch('totalPages', function (value) {
      setNumPages($scope.$parent, value); // Readonly variable

      if ($scope.page > value) {
        $scope.selectPage(value);
      } else {
        ngModelCtrl.$render();
      }
    });
  }])

  .directive('paginationLogger', ['$parse', 'paginationConfig', function ($parse, paginationConfig) {
    return {
      restrict: 'EA',
      scope: {
        totalItems: '=',
        firstText: '@',
        previousText: '@',
        nextText: '@',
        lastText: '@'
      },
      require: ['paginationLogger', '?ngModel'],
      controller: 'PaginationLoggerController',
      templateUrl: 'template/pagination/paginationLogger.html',
      replace: true,
      link: function (scope, element, attrs, ctrls) {
        var paginationCtrl = ctrls[0], ngModelCtrl = ctrls[1];

        if (!ngModelCtrl) {
          return; // do nothing if no ng-model
        }

        // Setup configuration parameters
        var maxSize = angular.isDefined(attrs.maxSize) ? scope.$parent.$eval(attrs.maxSize) : paginationConfig.maxSize,
          rotate = angular.isDefined(attrs.rotate) ? scope.$parent.$eval(attrs.rotate) : paginationConfig.rotate;
        scope.boundaryLinks = angular.isDefined(attrs.boundaryLinks) ? scope.$parent.$eval(attrs.boundaryLinks) : paginationConfig.boundaryLinks;
        scope.directionLinks = angular.isDefined(attrs.directionLinks) ? scope.$parent.$eval(attrs.directionLinks) : paginationConfig.directionLinks;

        paginationCtrl.init(ngModelCtrl, paginationConfig);

        if (attrs.maxSize) {
          scope.$parent.$watch($parse(attrs.maxSize), function (value) {
            maxSize = parseInt(value, 10);
            paginationCtrl.render();
          });
        }

        // Create page object used in template
        function makePage(number, text, isActive) {
          return {
            number: number,
            text: text,
            active: isActive
          };
        }

        function getPages(currentPage, totalPages) {
          var pages = [];
          totalPages--;

          // Default page limits
          var startPage = 0, endPage = totalPages;
          var isMaxSized = ( angular.isDefined(maxSize) && maxSize < totalPages );

          // recompute if maxSize
          if (isMaxSized) {
            if (rotate) {
              // Current page is displayed in the middle of the visible ones
              startPage = Math.max(currentPage - Math.floor(maxSize / 2), 0);
              endPage = startPage + maxSize - 1;

              // Adjust if limit is exceeded
              if (endPage > totalPages) {
                endPage = totalPages;
                startPage = endPage - maxSize + 1;
              }
            } else {
              // Visible pages are paginated with maxSize
              startPage = ((Math.ceil(currentPage / maxSize) - 1) * maxSize) + 1;

              // Adjust last page if limit is exceeded
              endPage = Math.min(startPage + maxSize - 1, totalPages);
            }
          }

          // Add page number links
          for (var number = startPage; number <= endPage; number++) {
            var page = makePage(number, number, number === currentPage);
            pages.push(page);
          }

          // Add links to move between page sets
          if (isMaxSized && !rotate) {
            if (startPage > 1) {
              var previousPageSet = makePage(startPage - 1, '...', false);
              pages.unshift(previousPageSet);
            }

            if (endPage < totalPages) {
              var nextPageSet = makePage(endPage + 1, '...', false);
              pages.push(nextPageSet);
            }
          }

          return pages;
        }

        var originalRender = paginationCtrl.render;
        paginationCtrl.render = function () {
          originalRender();
          if (scope.page >= 0 && scope.page <= scope.totalPages) {
            scope.pages = getPages(scope.page, scope.totalPages);
          }
        };
      }
    };
  }])

  .run(["$templateCache", function ($templateCache) {
    $templateCache.put("template/pagination/paginationLogger.html",
      "<ul class=\"pagination\">\n" +
      "  <li ng-if=\"boundaryLinks\" ng-class=\"{disabled: noPrevious()}\"><a class=\"link\" href ng-click=\"selectPage(0)\">{{getText('first')}}</a></li>\n" +
      "  <li ng-if=\"directionLinks\" ng-class=\"{disabled: noPrevious()}\"><a class=\"link\" href ng-click=\"selectPage(page - 1)\"><span class=\"glyphicon glyphicon-chevron-left\"></a></li>\n" +
      "  <li ng-class=\"{disabled: noPreviousFive()}\"><a class=\"link\" href ng-click=\"selectPage(page - 5)\"><span class=\"glyphicon glyphicon-chevron-left\"></span> 5</a></li>\n" +
      "  <li ng-class=\"{disabled: noPreviousTen()}\"><a class=\"link\" href ng-click=\"selectPage(page - 10)\"><span class=\"glyphicon glyphicon-chevron-left\"></span> 10</a></li>\n" +

      "  <li ng-repeat=\"page in pages track by $index\" ng-class=\"{active: page.active}\"><a href ng-click=\"selectPage(page.number)\">{{page.text}}</a></li>\n" +

      "  <li ng-class=\"{disabled: noNextTen()}\"><a class=\"link\" href ng-click=\"selectPage(page + 10)\">10 <span class=\"glyphicon glyphicon-chevron-right\"></span></a></li>\n" +
      "  <li ng-class=\"{disabled: noNextFive()}\"><a class=\"link\" href ng-click=\"selectPage(page + 5)\">5 <span class=\"glyphicon glyphicon-chevron-right\"></span></a></li>\n" +
      "  <li ng-if=\"directionLinks\" ng-class=\"{disabled: noNext()}\"><a class=\"link\" href ng-click=\"selectPage(page + 1)\"><span class=\"glyphicon glyphicon-chevron-right\"></a></li>\n" +
      "  <li ng-if=\"boundaryLinks\" ng-class=\"{disabled: noNext()}\"><a class=\"link\" href  ng-click=\"selectPage(totalPages - 1)\">{{getText('last')}}</a></li>\n" +
      "</ul>");
  }]);

chrome
  .setBrand({
    logo: 'url(/plugins/kibana_logger/icon.svg) left no-repeat',
    smallLogo: 'url(/plugins/kibana_logger/icon.svg) left no-repeat'
  })
  .setNavBackground('#222222')
  .setRootTemplate(indexView)
  .setRootController('kibanaLogger');
