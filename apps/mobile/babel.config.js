/**
 * В pnpm-монорепозитории babel-preset-expo не находит react-native-worklets сам:
 * плагин Reanimated подключаем явно и обязательно последним.
 */
module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-worklets/plugin"]
  };
};
