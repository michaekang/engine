
'use strict'

const EventEmitter = require('events').EventEmitter
const collect = require('stream-collector')
const async = require('async')
const pump = require('pump')
const through = require('through2')
const typeforce = require('typeforce')
const subdown = require('subleveldown')
const LiveStream = require('level-live-stream')
const debug = require('debug')('tradle:objectDB')
const changeProcessor = require('level-change-processor')
const protocol = require('@tradle/protocol')
const createIndexer = require('./indexer').indexer
const constants = require('./constants')
const utils = require('./utils')
const Status = require('./status')
const SealStatus = Status.seal
const SendStatus = Status.send
const topics = require('./topics')
const types = require('./types')
const reducer = require('./reducers').objectDB
const IDENTITY = constants.TYPES.IDENTITY
const MESSAGE_TYPE = constants.TYPES.MESSAGE
const LINK = constants.LINK
const PERMALINK = constants.PERMALINK
const PREVLINK = constants.PREVLINK
const SEPARATOR = constants.INDEX_SEPARATOR

// messages shouldn't be stored differently form
// other objects. This will create annoying asymmetry for message/object seals

module.exports = function (opts) {
  typeforce({
    changes: types.changes,
    db: types.db,
    keeper: types.keeper
  }, opts)

  const emitter = new EventEmitter()
  const db = opts.db
  const changes = opts.changes
  const processor = changeProcessor({
    feed: changes,
    db: subdown(db, '~'), // counter
    worker: worker
  })

  // maybe these props should
  // const indexedProps = ['sealstatus', 'sendstatus', 'watchstatus', 'type', LINK, PERMALINK]

  // const sent = liveDB(db, 'u1', { valueEncoding: 'utf8 '})
  // const unsent = liveDB(db, 'u2', { valueEncoding: 'utf8 '})
  // LiveStream.install(unsent)

  // const sealed = liveDB(db, 'u3', { valueEncoding: 'utf8' })
  // const unsealed = liveDB(db, 'u4', { valueEncoding: 'utf8' })
  // LiveStream.install(unsealed)

  const main = liveDB(db, 'm', { valueEncoding: 'json' })
  const index = liveDB(db, 'x', { valueEncoding: 'json' })

  // const byCurHash = liveDB(db, 'c')
  // const byRootHash = liveDB(db, 'r')

  const indexer = createIndexer(main, index)
  const keeper = opts.keeper
  const relevantTopics = [
    topics.newobj,
    topics.queueseal,
    topics.detectedseal,
    topics.sealed,
    topics.sent,
    topics.received
  ];

  function worker (change, cb) {
    const changeVal = change.value
    if (!changeVal.link || relevantTopics.indexOf(changeVal.topic) === -1) return cb()

    // validation done on API level
    // if (val[PERMALINK] && !val[PREVLINK]) {
    //   debug('ignoring object with root hash but no prev hash')
    //   return cb()
    // }

    // keep in mind: val[PERMALINK] cannot be trusted
    changeVal.uid = utils.uid(changeVal)
    const lookupUID = changeVal.prevlink ? utils.prevUID(changeVal) : changeVal.uid
    main.get(lookupUID, function (err, state) {
      const newState = reducer(state, changeVal)
      const batch = indexer.batch(newState, change)
      db.batch(batch, function (err) {
        if (err) return cb(err)

        cb()

        let event = getEvent(changeVal.topic)
        if (event) emitter.emit(event, newState)
      })
    })
  }

  // function getBatch (state, change) {
  //   const uid = getUID(state)
  //   const batch = indexedProps.map(prop => {
  //     if (!(prop in state)) return

  //     return {
  //       type: 'put',
  //       db: index,
  //       key: [prop, state[prop], rootHash].join(SEPARATOR),
  //       value: rootHash
  //     }
  //   })
  //   .filter(row => row)

  //   // could be generalized to any enum-valued properties
  //   if (state[TYPE] === MESSAGE_TYPE) {
  //     if (state.sealstatus === SealStatus.sealed) {
  //       batch.push({
  //         type: 'del',
  //         db: index,
  //         key: ['sealstatus', SealStatus.pending, msgID].join(SEPARATOR)
  //       })
  //     }

  //     if (state.sendstatus === SendStatus.sent) {
  //       batch.push({
  //         type: 'del',
  //         db: index,
  //         key: ['sendstatus', SendStatus.pending, msgID].join(SEPARATOR)
  //       })
  //     }
  //   }

  //   // if (state.watchstatus === Status.watch.seen || state.watchstatus === Status.watch.confirmed) {
  //   //   batch.push({
  //   //     type: 'del',
  //   //     db: index,
  //   //     key: ['sendstatus', Status.watch.unseen, msgID].join(SEPARATOR)
  //   //   })
  //   // }

  //   batch.push({
  //     type: 'put',
  //     db: main,
  //     key: msgID,
  //     value: state
  //   })

  //   return utils.encodeBatch(batch)
  // }

  function list (type, cb) {
    if (typeof type === 'function') {
      cb = type
      type = null
    }

    collect(streams.type(type, { body: true }), cb)
  }

  function createIndexStream (prop, value, opts) {
    opts = opts || {}
    opts.gt = prop + SEPARATOR
    if (value != null) {
      opts.gt += value + SEPARATOR
    }

    opts.lt = opts.gt + '\xff'
    opts.keys = opts.values = true

    const pipeline = [
      index.live.createReadStream(opts),
      through.obj(function (data, enc, cb) {
        if (data.type === 'del') cb()
        else cb(null, data.value) // figure out how to make it store utf8
      }),
      lookupObject()
    ]

    if (opts.body) pipeline.push(getBody())

    return pump.apply(null, pipeline)
  }

  // function createReadStream (db, opts) {
  //   opts = extend({
  //     tail: true,
  //     old: true,
  //     live: true
  //   }, opts)

  //   opts.keys = opts.values = true
  //   const source = db.live.createReadStream(opts)
  //   return pump(
  //     source,
  //     through.obj(function (data, enc, cb) {
  //       if (data.type === 'del') cb()
  //       else cb(null, db._codec.decodeValue(data.value)) // figure out how to make it store utf8
  //     }),
  //     lookupObject(),
  //     getBody()
  //   )
  // }

  function lookupObject () {
    return through.obj(function (uid, enc, cb) {
      main.get(uid.toString(), cb)
    })
  }

  function getBody () {
    return through.obj(function (data, enc, cb) {
      keeper.get(data.link, function (err, body) {
        if (err) return cb(err)

        data.object = body
        cb(null, data)
      })
    })
  }

  function liveDB () {
    const db = subdown.apply(null, arguments)
    LiveStream.install(db)
    return utils.addLiveMethods(db, processor)
  }

  const streams = {}
  // indexedProps.forEach(prop => {
  //   streams[prop] = function createReadStream (opts) {
  //     return createIndexStream(prop, null, opts)
  //   }
  // })

  streams.type = function (type, opts) {
    return createIndexStream('type', type, opts)
  }

  streams.unsent = function (opts) {
    return createIndexStream('sendstatus', SendStatus.pending, opts)
  }

  streams.unsealed = function (opts) {
    return createIndexStream('sealstatus', SealStatus.pending, opts)
  }

  streams.messages = function (opts) {
    streams.type(MESSAGE_TYPE, opts)
  }

  function byUID (uid, cb) {
    processor.onLive(() => main.get(uid, cb))
  }

  function byPermalink (permalink, cb) {
    processor.onLive(() => {
      main.get(permalink, function (err, uid) {
        if (err) return cb(err)

        byUID(uid, cb)
      })
    })
  }

  return utils.extend(emitter, {
    streams: streams,
    hasSealWithID: function hasSealWithID (sealID, cb) {
      async.some([unsealed, sealed].map(db => {
        return function get (done) {
          db.live.get(sealID, done)
        }
      }), cb)
    },
    // unsealedStream: function getUnsealed (opts) {
    //   return createReadStream(unsealed, opts)
    // },
    list: list,
    byPermalink: byPermalink,
    byUID: byUID,
    conversation: function (a, b, cb) {
      throw new Error('not implemented')
    }
  })
}

function getUID (state) {
  return state[PERMALINK] + SEPARATOR + state[LINK]
}

function getEvent (topic) {
  switch (topic) {
  case topics.sent:
    return 'sent'
  case topics.sealed:
    return 'wroteseal'
  case topics.detectedseal:
    return 'readseal'
  case topics.received:
    return 'received'
  }
}

// function getPrevHash (msg) {
//   return msg[PERMALINK] === msg[LINK] ? null : msg[PREVLINK] || msg[PERMALINK]
// }