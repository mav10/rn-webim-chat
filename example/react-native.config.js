const path = require('path');
const pak = require('../package.json');

module.exports = {
  project: {
    android: {
      packageName: 'com.rnwebimchatexample',
    },
  },
  dependencies: {
    [pak.name]: {
      root: path.join(__dirname, '..'),
    },
  },
};
