module.exports = function (options) {
  return {
    ...options,
    watchOptions: {
      ...options.watchOptions,
      poll: 1000,
      aggregateTimeout: 300,
    },
  };
};
