import api from './server/api';

module.exports = function (kibana) {
  return new kibana.Plugin({
    require: ['kibana', 'elasticsearch'],
    uiExports: {
      apps: {
        title: 'ST Logger',
        icon: 'plugins/kibana_logger/icon.png',
        main: 'plugins/kibana_logger/kibanaLogger',
        autoload: [].concat(
          kibana.autoload.styles,
          'ui/chrome',
          'ui/state_management/app_state',
          'ui/state_management/global_state',
          'ui/notify/notifier',
          'ui/timefilter',
          'ui/routes',
          'ui/modules',
          'ui/state_management/state',
          'angular',
          'ui-bootstrap'
        )
      }
    },
    init(server, options) {
      api(server, options);
    }
  });
};
