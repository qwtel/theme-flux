'use babel';

import { CompositeDisposable } from 'atom';
import _ from 'underscore-plus';
import SolarCalc from 'solar-calc';

const PACKAGE_NAME = 'theme-flux-solar';
const API_URL = 'https://www.googleapis.com/geolocation/v1/geolocate';
const INTERVAL = 10;
const MINUTES = 60 * 1000;

const API_DESCRIPTION = String.prototype.trim.call(`
\`${PACKAGE_NAME}\` needs a Google Maps Geolocation API key to retrive your location.
The location is necessary to caluclate the exact time of sunset and sunrise.

Get a key at:
https://developers.google.com/maps/documentation/geolocation/get-api-key
`);

const ERROR_DESCRIPTION = String.prototype.trim.call(`
\`theme-flux-solar\` could not retrive geo location. Maybe the API key is invalid?
`);

// Get a human readable title for the given theme name.
function getThemeTitle(themeName = '') {
  const title = themeName.replace(/-(ui|syntax)/g, '').replace(/-theme$/g, '');
  return _.undasherize(_.uncamelcase(title));
}

function themeToConfigStringEnum({ metadata: { name } }) {
  return {
    value: name,
    description: getThemeTitle(name),
  };
}

const loadedThemes = atom.themes.getLoadedThemes();

const uiThemesEnum = loadedThemes
  .filter(theme => theme.metadata.theme === 'ui')
  .map(themeToConfigStringEnum);

const syntaxThemesEnum = loadedThemes
  .filter(theme => theme.metadata.theme === 'syntax')
  .map(themeToConfigStringEnum);

export default {
  config: {
    apiKey: {
      order: 1,
      type: 'string',
      default: '',
      title: 'Google Maps Geolocation API Key',
      description: API_DESCRIPTION,
    },
    day: {
      order: 2,
      type: 'object',
      properties: {
        ui: {
          order: 1,
          title: 'UI Theme',
          type: 'string',
          default: 'one-light-ui',
          enum: uiThemesEnum,
        },
        syntax: {
          order: 2,
          title: 'Syntax Theme',
          type: 'string',
          default: 'one-light-syntax',
          enum: syntaxThemesEnum,
        },
      },
    },
    night: {
      order: 3,
      type: 'object',
      properties: {
        ui: {
          order: 1,
          title: 'UI Theme',
          type: 'string',
          default: 'one-dark-ui',
          enum: uiThemesEnum,
        },
        syntax: {
          order: 2,
          title: 'Syntax Theme',
          type: 'string',
          default: 'one-dark-syntax',
          enum: syntaxThemesEnum,
        },
      },
    },
  },

  activate() {
    this.changeTheme = this.changeTheme.bind(this);
    this.forceChangeTheme = this.forceChangeTheme.bind(this);
    this.changeThemeGeo = this.changeThemeGeo.bind(this);

    this.subscriptions = new CompositeDisposable();
    this.subscriptions.add(atom.config.observe(PACKAGE_NAME, this.forceChangeTheme));
    this.intervalId = setInterval(this.changeTheme, INTERVAL * MINUTES);
  },

  deactivate() {
    this.subscriptions.dispose();
    clearInterval(this.intervalId);
  },

  forceChangeTheme() {
    this.wasDay = null;
    this.changeTheme();
  },

  changeTheme() {
    let apiKey = atom.config.get(`${PACKAGE_NAME}.apiKey`);
    apiKey = apiKey && apiKey.trim();
    if (apiKey) {
      window.fetch(`${API_URL}?key=${apiKey}`, { method: 'POST' })
        .then(x => x.json())
        .then(this.changeThemeGeo)
        .then(() => {
          if (!window.localStorage.getItem(`${PACKAGE_NAME}.first`)) {
            window.localStorage.setItem(`${PACKAGE_NAME}.first`, true);
            const noti = atom.notifications.addSuccess('Retrived geolocation', {
              dismissable: true,
            });
            setTimeout(() => noti.dismiss(), 10 * 1000);
          }
        })
        .catch(() => {
          window.localStorage.removeItem(`${PACKAGE_NAME}.first`);
          atom.notifications.addError('Could not retrive geolocation', {
            description: ERROR_DESCRIPTION,
            buttons: [{
              text: 'Check API Key',
              onDidClick: () => atom.workspace.open(`atom://config/packages/${PACKAGE_NAME}`),
            }],
            dismissable: true,
          });
        });
    } else if (!window.localStorage.getItem(`${PACKAGE_NAME}.welcome`)) {
      window.localStorage.setItem(`${PACKAGE_NAME}.welcome`, true);
      atom.notifications.addInfo('API key required', {
        description: API_DESCRIPTION,
        buttons: [{
          text: 'Set API Key',
          onDidClick: () => atom.workspace.open(`atom://config/packages/${PACKAGE_NAME}`),
        }],
        dismissable: true,
      });
    }
  },

  changeThemeGeo({ location: { lat, lng } }) {
    const solar = new SolarCalc(new Date(), lat, lng);
    const isDay = this.isDay(solar);

    if (isDay !== this.wasDay) {
      this.scheduleThemeUpdate(isDay ? [
        atom.config.get(`${PACKAGE_NAME}.day.ui`),
        atom.config.get(`${PACKAGE_NAME}.day.syntax`),
      ] : [
        atom.config.get(`${PACKAGE_NAME}.night.ui`),
        atom.config.get(`${PACKAGE_NAME}.night.syntax`),
      ]);

      this.wasDay = isDay;
    }
  },

  scheduleThemeUpdate(themes) {
    setTimeout(() => atom.config.set('core.themes', themes), 100);
  },

  // Change to day 10 minutes before sunrise, and
  // change to night 10 minutes before sunset.
  isDay({ sunrise, sunset }) {
    const now = new Date();
    const b4Sunrise = sunrise - (INTERVAL * MINUTES);
    const b4Sunset = sunset - (INTERVAL * MINUTES);
    return now > b4Sunrise && now < b4Sunset;
  },
};
