# JavaScript Cross Origin Frame RPC

This tiny script enables you to call functions of an object, which sits in a (cross origin) frame, from an other frame.


# Setup

## 1. Choose channel name

First you choose a channel name the __caller__ (or sender) and __executor__ (or receiver) communiate over. Lets say it's `yellow-post`.


## 2. Set up executor/receiver side

We need to set up the remote "service" / executor. First import the script:

```
<head>
    <script src="dist/cross_window_rpc.min.js"></script>
</head>
```

Then put somewhere a script block or import your main js file. There you put the following code:

```
const targetObject = {
    foo: function() {
        return "bar"
    },

    greet: function(name) {
        return `Hello ${name}! How are you today?`
    }
}

const listener = setupCrossWindowExecutor(
    targetObject,   // its methods will be executed
    "yellow-post",  // channel name
)
```

That's it!


## 3. Set up caller side

On the caller side, first import the script - just like on the receiver side:

```
<head>
    <script src="dist/cross_window_rpc.min.js"></script>
</head>
```

Then you put somewhere a script block or extend your main js file. There are two ways to execute remote methods.

### Proxy object

This is the most convenient version. You create a proxy object, which acts like your remote object:

```
const service = createCrossWindowExecutorProxy(
    // the target window (here: we are an iframe and call a service within the parent frame)
    window.parent,   

    // channel name
    "yellow-post",   

    // optional timeout in ms > default = 2000ms > on timeout, we get an error
    1000             
)

service.foo()
    .then(result => { console.log(result) })    // will output "bar"

service.greet("Peter")
    .then(result => { console.log(result) })    // will output "Hello Peter! How are you today?"

service.someFunction()
    .then(result => { console.log(result) })
    .catch(error => { console.log(error) })     // will output "someFunction does not exist"
```

### "Native" call

The same can be done using a call to `callCrossWindowExecutor(...)`:

```
// Equivalent for service.greet("Peter") from previous example

callCrossWindowExecutor(
    parent.window,
    "yellow-post",

    // method name
    "greet",

    // arguments as array
    ["Peter"],

    // optional timeout in ms > default = 2000ms
    1000

).then(result => {
    // will output "Hello Peter! How are you today?"
    console.log(result)    
})    
```

# Example

Check out the two html files in the directory `example`. It contains a use case for this RPC script.

# Background

This implementation is based on following features:

- `window.postMessage`
- `Promise`
- `Proxy` (if not available, use the "native" call method)
- native JavaScript
