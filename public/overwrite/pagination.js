/**
 * Created by ealvarado on 6/28/2016.
 */
import modules from "ui/modules";

const app = modules.get('app/log_browser', ['ui.bootstrap', 'ui.bootstrap.pagination', 'rzModule']);

app
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
            return $scope.page < 10;
        };
        $scope.noPreviousTen = function () {
            return $scope.page < $scope.pageSize;
        };
        $scope.noPreviousPage = function () {
            return $scope.page < this.itemsPerPage;
        };
        $scope.noNext = function () {
            return $scope.page === $scope.totalPages - 1;
        };
        $scope.noNextFive = function () {
            return $scope.page >= $scope.totalPages - 11;
        };
        $scope.noNextTen = function () {
            return $scope.page >= $scope.totalPages - $scope.pageSize - 1;
        };
        $scope.noNextPage = function () {
            return $scope.page >= $scope.totalPages - this.itemsPerPage - 1;
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

        $scope.updated = _.debounce(() => {

            $scope.page = $scope.page > $scope.totalPages - 1 ? $scope.totalPages - 1 : $scope.page;
            $scope.page = $scope.page < 0 ? 0 : $scope.page;

            ngModelCtrl.$setViewValue($scope.page);
        }, 500);
    }])

    .directive('paginationLogger', ['$parse', 'paginationConfig', function ($parse, paginationConfig) {
        return {
            restrict: 'EA',
            scope: {
                totalItems: '=',
                pageSize: '=',
                isDisabled: '=',
                firstText: '@',
                previousText: '@',
                nextText: '@',
                lastText: '@'
            },
            require: ['paginationLogger', '?ngModel'],
            controller: 'PaginationLoggerController',
            controllerAs: 'ctrl',
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
            "  <li ng-if=\"boundaryLinks\" ng-class=\"{disabled: noPrevious() || isDisabled}\" ng-disabled=\"isDisabled\"><a class=\"link\" href ng-click=\"selectPage(0)\">{{getText('first')}}</a></li>\n" +
            "  <li ng-if=\"directionLinks\" ng-class=\"{disabled: noPrevious() || isDisabled}\" ng-disabled=\"isDisabled\"><a class=\"link\" href ng-click=\"selectPage(page - 1)\"><span class=\"glyphicon glyphicon-chevron-left\"></a></li>\n" +
            "  <li ng-class=\"{disabled: noPreviousFive() || isDisabled}\" ng-disabled=\"isDisabled\"><a class=\"link\" href ng-click=\"selectPage(page - 10)\"><span class=\"glyphicon glyphicon-chevron-left\"></span> 10</a></li>\n" +
            "  <li ng-class=\"{disabled: noPreviousTen() || isDisabled}\" ng-disabled=\"isDisabled\"><a class=\"link\" href ng-click=\"selectPage(page - pageSize)\"><span class=\"glyphicon glyphicon-chevron-left\"></span> {{pageSize}}</a></li>\n" +

            //"  <li ng-repeat=\"page in pages track by $index\" ng-class=\"{active: page.active}\"><a href ng-click=\"selectPage(page.number)\">{{page.text}}</a></li>\n" +
            "  <li>" +
            "<span class=\"pagination-group\">" +
            "<input type=\"text\" class=\"form-control \" ng-model=\"page\" ng-change=\"updated()\" ng-disabled=\"isDisabled\"> of <span type=\"text\" ng-bind=\"totalPages - 1\" /></span>" +
            "</span>" +
            "</li>\n" +

            "  <li ng-class=\"{disabled: noNextTen() || isDisabled}\" ng-disabled=\"isDisabled\"><a class=\"link\" href ng-click=\"selectPage(page + pageSize)\">{{pageSize}} <span class=\"glyphicon glyphicon-chevron-right\"></span></a></li>\n" +
            "  <li ng-class=\"{disabled: noNextFive() || isDisabled}\" ng-disabled=\"isDisabled\"><a class=\"link\" href ng-click=\"selectPage(page + 10)\">10 <span class=\"glyphicon glyphicon-chevron-right\"></span></a></li>\n" +
            "  <li ng-if=\"directionLinks\" ng-class=\"{disabled: noNext() || isDisabled}\" ng-disabled=\"isDisabled\"><a class=\"link\" href ng-click=\"selectPage(page + 1)\"><span class=\"glyphicon glyphicon-chevron-right\"></a></li>\n" +
            "  <li ng-if=\"boundaryLinks\" ng-class=\"{disabled: noNext() || isDisabled}\" ng-disabled=\"isDisabled\"><a class=\"link\" href  ng-click=\"selectPage(totalPages - 1)\">{{getText('last')}}</a></li>\n" +
            "</ul>");
    }]);
