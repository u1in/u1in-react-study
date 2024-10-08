'use strict';

var React = require('react');
var Scheduler = require('scheduler/unstable_mock');

var assign = Object.assign;

// ATTENTION
// When adding new symbols to this file,
// Please consider also adding to 'react-devtools-shared/src/backend/ReactSymbols'

// The Symbol used to tag the ReactElement-like types.
var REACT_ELEMENT_TYPE = Symbol.for('react.element');
var REACT_FRAGMENT_TYPE = Symbol.for('react.fragment');

var isArrayImpl = Array.isArray;

// eslint-disable-next-line no-redeclare
function isArray(a) {
  return isArrayImpl(a);
}

var ReactSharedInternals = React.__SECRET_INTERNALS_DO_NOT_USE_OR_YOU_WILL_BE_FIRED;

function error(format) {
  {
    {
      for (var _len2 = arguments.length, args = new Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        args[_key2 - 1] = arguments[_key2];
      }
      printWarning('error', format, args);
    }
  }
}
function printWarning(level, format, args) {
  // When changing this logic, you might want to also
  // update consoleWithStackDev.www.js as well.
  {
    var ReactDebugCurrentFrame = ReactSharedInternals.ReactDebugCurrentFrame;
    var stack = ReactDebugCurrentFrame.getStackAddendum();
    if (stack !== '') {
      format += '%s';
      args = args.concat([stack]);
    }

    // eslint-disable-next-line react-internal/safe-string-coercion
    var argsWithFormat = args.map(function (item) {
      return String(item);
    });
    // Careful: RN currently depends on this prefix
    argsWithFormat.unshift('Warning: ' + format);
    // We intentionally don't use spread (or .apply) directly because it
    // breaks IE9: https://github.com/facebook/react/issues/13610
    // eslint-disable-next-line react-internal/no-production-logging
    Function.prototype.apply.call(console[level], console, argsWithFormat);
  }
}

var didWarnAboutMessageChannel = false;
var enqueueTaskImpl = null;
function enqueueTask(task) {
  if (enqueueTaskImpl === null) {
    try {
      // read require off the module object to get around the bundlers.
      // we don't want them to detect a require and bundle a Node polyfill.
      var requireString = ('require' + Math.random()).slice(0, 7);
      var nodeRequire = module && module[requireString];
      // assuming we're in node, let's try to get node's
      // version of setImmediate, bypassing fake timers if any.
      enqueueTaskImpl = nodeRequire.call(module, 'timers').setImmediate;
    } catch (_err) {
      // we're in a browser
      // we can't use regular timers because they may still be faked
      // so we try MessageChannel+postMessage instead
      enqueueTaskImpl = function (callback) {
        {
          if (didWarnAboutMessageChannel === false) {
            didWarnAboutMessageChannel = true;
            if (typeof MessageChannel === 'undefined') {
              error('This browser does not have a MessageChannel implementation, ' + 'so enqueuing tasks via await act(async () => ...) will fail. ' + 'Please file an issue at https://github.com/facebook/react/issues ' + 'if you encounter this warning.');
            }
          }
        }
        var channel = new MessageChannel();
        channel.port1.onmessage = callback;
        channel.port2.postMessage(undefined);
      };
    }
  }
  return enqueueTaskImpl(task);
}

var actingUpdatesScopeDepth = 0;
function act(scope) {
  if (Scheduler.unstable_flushAllWithoutAsserting === undefined) {
    throw Error('This version of `act` requires a special mock build of Scheduler.');
  }
  if (setTimeout._isMockFunction !== true) {
    throw Error("This version of `act` requires Jest's timer mocks " + '(i.e. jest.useFakeTimers).');
  }
  var previousIsActEnvironment = global.IS_REACT_ACT_ENVIRONMENT;
  var previousActingUpdatesScopeDepth = actingUpdatesScopeDepth;
  actingUpdatesScopeDepth++;
  if ( actingUpdatesScopeDepth === 1) {
    // Because this is not the "real" `act`, we set this to `false` so React
    // knows not to fire `act` warnings.
    global.IS_REACT_ACT_ENVIRONMENT = false;
  }
  var unwind = function () {
    if ( actingUpdatesScopeDepth === 1) {
      global.IS_REACT_ACT_ENVIRONMENT = previousIsActEnvironment;
    }
    actingUpdatesScopeDepth--;
    {
      if (actingUpdatesScopeDepth > previousActingUpdatesScopeDepth) {
        // if it's _less than_ previousActingUpdatesScopeDepth, then we can
        // assume the 'other' one has warned
        error('You seem to have overlapping act() calls, this is not supported. ' + 'Be sure to await previous act() calls before making a new one. ');
      }
    }
  };

  // TODO: This would be way simpler if 1) we required a promise to be
  // returned and 2) we could use async/await. Since it's only our used in
  // our test suite, we should be able to.
  try {
    var result = scope();
    if (typeof result === 'object' && result !== null && typeof result.then === 'function') {
      var thenableResult = result;
      return {
        then: function (resolve, reject) {
          thenableResult.then(function (returnValue) {
            flushActWork(function () {
              unwind();
              resolve(returnValue);
            }, function (error) {
              unwind();
              reject(error);
            });
          }, function (error) {
            unwind();
            reject(error);
          });
        }
      };
    } else {
      var returnValue = result;
      try {
        // TODO: Let's not support non-async scopes at all in our tests. Need to
        // migrate existing tests.
        var didFlushWork;
        do {
          didFlushWork = Scheduler.unstable_flushAllWithoutAsserting();
        } while (didFlushWork);
        return {
          then: function (resolve, reject) {
            resolve(returnValue);
          }
        };
      } finally {
        unwind();
      }
    }
  } catch (error) {
    unwind();
    throw error;
  }
}
function flushActWork(resolve, reject) {
  // Flush suspended fallbacks
  // $FlowFixMe: Flow doesn't know about global Jest object
  jest.runOnlyPendingTimers();
  enqueueTask(function () {
    try {
      var didFlushWork = Scheduler.unstable_flushAllWithoutAsserting();
      if (didFlushWork) {
        flushActWork(resolve, reject);
      } else {
        resolve();
      }
    } catch (error) {
      reject(error);
    }
  });
}

function captureAssertion(fn) {
  // Trick to use a Jest matcher inside another Jest matcher. `fn` contains an
  // assertion; if it throws, we capture the error and return it, so the stack
  // trace presented to the user points to the original assertion in the
  // test file.
  try {
    fn();
  } catch (error) {
    return {
      pass: false,
      message: function () {
        return error.message;
      }
    };
  }
  return {
    pass: true
  };
}
function assertYieldsWereCleared(root) {
  var Scheduler = root._Scheduler;
  var actualYields = Scheduler.unstable_clearYields();
  if (actualYields.length !== 0) {
    throw new Error('Log of yielded values is not empty. ' + 'Call expect(ReactTestRenderer).unstable_toHaveYielded(...) first.');
  }
}
function unstable_toMatchRenderedOutput(root, expectedJSX) {
  assertYieldsWereCleared(root);
  var actualJSON = root.toJSON();
  var actualJSX;
  if (actualJSON === null || typeof actualJSON === 'string') {
    actualJSX = actualJSON;
  } else if (isArray(actualJSON)) {
    if (actualJSON.length === 0) {
      actualJSX = null;
    } else if (actualJSON.length === 1) {
      actualJSX = jsonChildToJSXChild(actualJSON[0]);
    } else {
      var actualJSXChildren = jsonChildrenToJSXChildren(actualJSON);
      if (actualJSXChildren === null || typeof actualJSXChildren === 'string') {
        actualJSX = actualJSXChildren;
      } else {
        actualJSX = {
          $$typeof: REACT_ELEMENT_TYPE,
          type: REACT_FRAGMENT_TYPE,
          key: null,
          ref: null,
          props: {
            children: actualJSXChildren
          },
          _owner: null,
          _store:  {} 
        };
      }
    }
  } else {
    actualJSX = jsonChildToJSXChild(actualJSON);
  }
  return captureAssertion(function () {
    expect(actualJSX).toEqual(expectedJSX);
  });
}
function jsonChildToJSXChild(jsonChild) {
  if (jsonChild === null || typeof jsonChild === 'string') {
    return jsonChild;
  } else {
    var jsxChildren = jsonChildrenToJSXChildren(jsonChild.children);
    return {
      $$typeof: REACT_ELEMENT_TYPE,
      type: jsonChild.type,
      key: null,
      ref: null,
      props: jsxChildren === null ? jsonChild.props : assign({}, jsonChild.props, {
        children: jsxChildren
      }),
      _owner: null,
      _store:  {} 
    };
  }
}
function jsonChildrenToJSXChildren(jsonChildren) {
  if (jsonChildren !== null) {
    if (jsonChildren.length === 1) {
      return jsonChildToJSXChild(jsonChildren[0]);
    } else if (jsonChildren.length > 1) {
      var jsxChildren = [];
      var allJSXChildrenAreStrings = true;
      var jsxChildrenString = '';
      for (var i = 0; i < jsonChildren.length; i++) {
        var jsxChild = jsonChildToJSXChild(jsonChildren[i]);
        jsxChildren.push(jsxChild);
        if (allJSXChildrenAreStrings) {
          if (typeof jsxChild === 'string') {
            jsxChildrenString += jsxChild;
          } else if (jsxChild !== null) {
            allJSXChildrenAreStrings = false;
          }
        }
      }
      return allJSXChildrenAreStrings ? jsxChildrenString : jsxChildren;
    }
  }
  return null;
}

exports.act = act;
exports.unstable_toMatchRenderedOutput = unstable_toMatchRenderedOutput;
//# sourceMappingURL=jest-react.development.js.map
