import logbrowser_get from './server/routes/logbrowser_get';

export default function (kibana) {
    return new kibana.Plugin({
        require: ['elasticsearch'],
        uiExports: {
            apps: {
                title: 'Log Browser',
                description: 'Log Browser for Big Data',
                icon: 'plugins/log_browser/icon.png',
                main: 'plugins/log_browser/app'
            }
        },
        init(server, options) {
            logbrowser_get(server, options);
        }
    });
};