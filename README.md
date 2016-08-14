# tradle engine

SDK for real-rime auditable blockchain-based messaging

# Overview

[![Build status](https://travis-ci.org/tradle/engine.svg)](https://travis-ci.org/tradle/engine)

This is the main component of Tradle's SDK that provides real-time messaging with an option for messages to be sealed on the blockchain. Messages can be plain or structured messages. The engine can be made to work on mobiles, desktops and servers. Having one codebase is important to minimize security reviews. 

The engine is designed to work with intermittent connections, common on mobile devices. For that it keeps an internal log of all actions and events, and resumes operations as soon as network connection is restored.

The engine's operations are covered by a patent. The tatent is filed only for defensive purposes, so you are welcome to use it in your open source projects.

_this module is used by [Tradle](https://github.com/tradle/about/wiki)_  

The engine provides a higher level API to a number of low level Tradle components. A UI is developed separately. Currently we focus on [React Native based UI](https://github.com/pgmemk/TiM) (on iOS, the Android version is in works), see the [preview video](https://www.youtube.com/watch?v=S66T0dPNn5I) and the [screenshots](https://docs.google.com/document/d/10eV6wgKr_vmfrXR4bDZ5XuylWJMNIJxziXM9T2CzCew). 

### Datalog

This module uses a datalog, a log-based database of experienced activity that you can use to bootstrap your own databases from.

### Messaging API

Details to follow

# Usage

See [examples](https://github.com/tradle/example)

## Events

#### tim.on('ready', function () {...})

the engine has completed initialization. You don't need to wait for this event, internal logic takes care of it.

#### tim.on('message', function (message, sender) {...}

You've received a `message` from `sender`

#### tim.on('wroteseal', function (seal) {...}

An object was sealed to a blockchain

#### tim.on('readseal', function (seal) {...}

An object was read off chain

#### tim.on('sent', function (msg) {...}

A message was successfully delivered
