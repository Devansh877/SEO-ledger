// Express 4 does NOT automatically catch a rejected promise from an async
// route handler — if one throws (a bad query, a missing table, anything),
// the rejection goes unhandled. Modern Node treats an unhandled rejection
// as fatal and kills the whole process, not just that one request — which
// is why a single failing query was taking down every other in-flight
// request too, not just its own. Wrapping every handler in this forwards
// the error to Express's error-handling middleware instead of letting it
// escape.
module.exports = function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};
