import api from "./server/api";

export default function (kibana) {
    return new kibana.Plugin({
        require: ['elasticsearch'],
        uiExports: {
            apps: {
                title: 'Log Browser',
                description: 'Log Browser for Big Data',
                icon: 'plugins/log_browser/icon.png',
                main: 'plugins/log_browser/app',
               /*autoload: [].concat(
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
                )*/
            }
        },
        init(server, options) {
            api(server, options);
        }
    });
};