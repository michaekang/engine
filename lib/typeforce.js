
/**
 * typeforce wrapper, disabled in production mode
 * @module typeforce
 */

const extend = require('lodash/extend')
const typeforce = require('typeforce')
const debug = require('debug')('tradle:debug')

module.exports = extend(function typeforceWithDebug () {
  if (!debug.enabled) return typeforce.apply(typeforce, arguments)

  try {
    return typeforce.apply(typeforce, arguments)
  } catch (err) {
    debug('typecheck failed: ' + getStack(err), arguments)
    throw err
  }
}, typeforce)

function getStack (err) {
  if (err.__error) return err.__error.stack

  return err.stack
}
