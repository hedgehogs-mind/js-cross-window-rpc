/*

This script provides some function to call functions of an object which sits in an other (cross origin) frame. Function results are returned back.

The whole concept is like RPC (remote procedure call), using Promises for asynchronous response handling.

# Prerequisites:

You must choose a communication channel name. Sender and receiver can only work together if they share the same communication channel name.


# Sender side / iframe:

There are two ways to call a remote object's function:

    1. Using a super convenient and cool proxy! :)

        You therefore do the following:


            const proxy = createCrossWindowExecutorProxy(
                parent.window, // the window object of the target frame,
                "super-secret-channel", // the channel name
                1000 // optional timeout in ms, default = 2000ms
            )


        You can then call any functions of the remote object by calling them on the proxy. Results are handled via a Promise:


            proxy.convertToGirlName("Peter")
                .then(result => { console.log(`Girl name for Peter: ${result}`) })  // may prints "Petra"
                .catch(error => { console.log(error) })  // may prints "convertToGirlName is not a function"


    2. Using native rpc call function:

        You therefor call the following (equivalent to previous example):

                callCrossWindowExecutor(
                    parent.window,    // target window
                    "super-secret-channel",  // channel name
                    "convertToGirlName",    // function name
                    [],     // method parameters as arguments
                    1000    // optional timeout
                )
                    .then(result => { console.log(`Girl name for Peter: ${result}`) })  // may prints "Petra"
                    .catch(error => { console.log(error) })  // may prints "convertToGirlName is not a function"


# Receiver side

On the receiver side you only need to create a handler which receives RPC requests and executes sync or async methods of a certain object:

    const handler = {
        convertToGirlName: function(name) {
            if ( name === "Peter" ) return "Petra"
            else if ( name === "Anton" ) return "Antonia"
            else if ( name === "Michael" ) return "Michaela"

            throw new Error("Can not convert name "+name+" to girl version.")
        },

        asyncMethod: function(name) {
            return Promise(resolve => {
                setTimeout(() => {
                    resolve(handler.convertToGirlName(name))
                }, 400)
            })
        }
    }

    setupCrossWindowExecutor(
        handler,        // the object whose methods will be tried to be called
        "super-secret-channel"   // channel name
    )


# Relay betwenn frames/windows

If an intermediate frame or window wants to connect sender and receiver you can establish one or more relays
in intermediate frames.

Just call `setupCrossWindowMessageRelay(relayTarget, commChannel)`. relayTarget is the e.g. the parent window.


# Debug logs

Sender, relays and receiver perform basic console.debug()-calls which allows basic data flow debugging.

*/



// ######### RPC MESSAGES

/*

Sample request:

{
    commIndex: 0,
    commChannel: "test",
    commType: "request",
    method: "foo",
    args: ["abc"] // optional
}


Sample response:

{
    commIndex: 0,
    commChannel: "test",
    commType: "response",
    method: "foo",
    success: true
    result: "Hello World" // this is optional
}

Or an error response:

{
    commIndex: 0,
    commChannel: "test",
    commType: "response",
    method: "foo",
    success: false
    result: "'foo' is not a function"
}

*/


// ########## RPC SENDER SIDE

function callCrossWindowExecutor(targetWindow, commChannel, method, argArray, timeout = 2000) {

    // by this, each "request" has its own pseudo "id"

    if ( !window.CROSS_COMM_INDEX ) {
        window.CROSS_COMM_INDEX = 0
    }

    const callIndex = window.CROSS_COMM_INDEX++

    return new Promise((resolve, reject) => {

        let alreadyHandledByListener = false
        let decayTimeout = null

        function handleResponse(event) {
            if ( event.data ) {
                const response = event.data

                // Check if response matches request
                if ( response.commIndex === callIndex &&
                    response.commChannel === commChannel && 
                    response.commType === "response" &&
                    response.method === method
                ) {
                    console.debug(`Sender: Received response. [commChannel: '${response.commChannel}', commIndex: ${response.commIndex}]`)

                    alreadyHandledByListener = true
                    if ( decayTimeout !== null ) clearTimeout(decayTimeout)

                    window.removeEventListener("message", handleResponse)

                    if ( response.success ) {
                        if ( response.result ) resolve(response.result)
                        else resolve()
                    } else {
                        reject(response.result ? response.result : new Error("Remote call returned with success = false. No error message given."))
                    }
                }
            }
        }

        window.addEventListener("message", handleResponse)

        // message array = [FUNCTION_NAME, ...ARGS]
        const message = {
            commIndex: callIndex,
            commChannel: commChannel,
            commType: "request",
            method: method,
            args: !!argArray ? argArray : []
        }

        
        targetWindow.postMessage(message, "*")

        console.debug(`Sender: Sent request. [commChannel: '${message.commChannel}', commIndex: ${message.commIndex}]`)

        if ( !alreadyHandledByListener ) {
            decayTimeout = setTimeout(() => {
                window.removeEventListener("message", handleResponse)

                reject(new Error(`Remote call timeout. Got no response from called window after ${timeout} ms.`))
            }, timeout)
        }

    })
}

function createCrossWindowExecutorProxy(targetWindow, commChannel, timeout = 2000) {
    return new Proxy({}, {
        get: function(target, prop, receiver) {
            return function() {
                return callCrossWindowExecutor(
                    targetWindow,
                    commChannel,
                    prop,
                    [...arguments],
                    timeout
                )
            }
        }
    })
}






// #########  RECEIVER SIDE

function setupCrossWindowExecutor(callTarget, commChannel) {
    const listener = function messageListener(event) {
        const request = event.data

        if ( request && 
            request.commChannel === commChannel && 
            request.commType === "request" &&
            request.commIndex !== undefined ) {

            console.debug(`Receiver: Received request. [commChannel: '${request.commChannel}', commIndex: ${request.commIndex}]`)

            let success = false
            let callResult = null

            if ( !request.method ) {
                callResult = "method name was empty/not given"

            } else {
                const methodOfCallTarget = callTarget[request.method]

                if ( methodOfCallTarget === undefined ) {
                    callResult = `'${request.method}' does not exist`
                } else if ( typeof methodOfCallTarget.apply !== "function" ) {
                    callResult = `'${request.method}' is not a function`
                } else {
                    try {
                        callResult = methodOfCallTarget.apply(
                            callTarget, 
                            Array.isArray(request.args) ? request.args : []
                        )
                        success = true
                    } catch(error) {
                        callResult = error.toString()
                    }
                }
            }

            Promise.resolve(callResult).then((result) => {
                const responseMessage = {
                    commIndex: request.commIndex,
                    commChannel: commChannel,
                    commType: "response",
                    method: request.method,
                    success: success,
                }
    
                if ( result !== undefined && result !== null ) {
                    responseMessage.result = result
                }

                event.source.postMessage(responseMessage, "*")

                console.debug(`Receiver: Finished receiver side execution. Sent response. [commChannel: '${request.commChannel}', commIndex: ${request.commIndex}]`)

            }).catch((error) => {
                const responseMessage = {
                    commIndex: request.commIndex,
                    commChannel: commChannel,
                    commType: "response",
                    method: request.method,
                    success: false,
                }
    
                if ( error !== undefined && error !== null ) {
                    responseMessage.result = error
                }
    
                event.source.postMessage(responseMessage, "*")
            })
        }
    }

    window.addEventListener("message", listener)

    return listener
}


// ####### Relay

function setupCrossWindowMessageRelay(relayTarget, commChannel) {

    this.commIndexSources = {}

    const listener = function relayMessageListener(event) {
        const message = event.data

        if ( message && 
            message.commChannel === commChannel && 
            message.commIndex !== undefined ) {

            if ( message.commType === "request" ) {
                
                console.debug(`Relay: Received request. Redirecting request to relay target. [commChannel: '${message.commChannel}', commIndex: ${message.commIndex}]`)

                // redirect request and save event source
                relayTarget.postMessage(message, "*")                
                this.commIndexSources[message.commIndex.toString()] = event.source

            } else if ( message.commType === "response" ) {

                // extract source
                const source = this.commIndexSources[message.commIndex.toString()]

                if ( source ) {
                    console.debug(`Relay: Received respone. Sending response back to source. [commChannel: '${message.commChannel}', commIndex: ${message.commIndex}]`)
                    source.postMessage(message, "*")
                } else {
                    console.debug(`Relay: Warning > Received response, but source unknown (there was no request beforehand). [commChannel: '${message.commChannel}', commIndex: ${message.commIndex}]`)
                }
                
            }
        }
    }

    window.addEventListener("message", listener)

    return listener
}