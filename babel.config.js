module.exports = function (api) {
  api.cache(true);
  return {
    presets: ['babel-preset-expo'],
    plugins: [
      // Drizzle's Expo migration bundle does `import m from './0000_x.sql'` and
      // expects the file's TEXT. Without this, Metro hands the .sql to the JS
      // parser and the build dies on "CREATE TABLE". Pairs with
      // `sourceExts.push('sql')` in metro.config.js.
      ['inline-import', { extensions: ['.sql'] }],
      // Must stay LAST — react-native-worklets (which Reanimated 4, and
      // therefore victory-native, depends on) requires its plugin final.
      'react-native-worklets/plugin',
    ],
  };
};
