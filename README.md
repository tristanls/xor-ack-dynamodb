# xor-ack-dynamodb

_Stability: 1 - [Experimental](https://github.com/tristanls/stability-index#stability-1---experimental)_

[![NPM version](https://badge.fury.io/js/xor-ack-dynamodb.png)](http://npmjs.org/package/xor-ack-dynamodb)

## Contributors

[@tristanls](https://github.com/tristanls)

## Contents

  * [Overview](#overview)
  * [Installation](#installation)
  * [Tests](#tests)
  * [Usage](#usage)
  * [Documentation](#documentation)
  * [Releases](#releases)

## Overview

`xor-ack-dynamodb` is a tracker mechanism inspired by XOR tracking in [Storm](https://storm.apache.org/index.html). It can track multitudes of messages/events in ack chains and report whether or not all of them have been processed.

### How it works

`xor-ack-dynamodb` uses properties of bitwise XOR operation to implement tracking functionality. Here is a quick overview of the relevant aspects of XOR. The XOR (`^`) operation has the following properties:

`A ^ A = 0`

and

`A ^ B ^ C = B ^ A ^ C`, `A ^ D ^ B ^ A ^ B ^ D = 0`.

#### Ack chain

Let's say that you want to do a word count, and you have a database containing text files that contain words.

```
database -> files -> words
```

Our approach will be event driven, so we will iterate through the `database` and emit a `file` event for each file we encounter.

```
          +-> 'file'
         /
database ---> 'file'
         \
          +-> 'file'
```

Another part of our computation will accept those `file` events and emit `word` events for each word encountered.

```
          +-> 'word'
         /
... file ---> 'word'
         \
          +-> 'word'
```

How do we track that a particular file has been fully processed when assuming that at each point the processing of any one of the words in that file could fail?

For every `file`, you can create a unique `tag` and a random `xorStamp`. We will then initialize an ack chain. Below example uses specifically crafted buffers for illustration purposes. In real use, you want to use a random Buffer, perhaps generated via:

```javascript
const xorStamp = crypto.randomBytes(64);
```

In our example, we generate `tag` and `xorStamp`.

```javascript
const AWS = require("aws-sdk");
const XorAckDynamoDB = require("xor-ack-dynamodb");

const dynamoDB = new AWS.DynamoDB.DocumentClient(
    {
        region: "us-east-1"
    }
);

const ack = new XorAckDynamoDB(
    {
        dynamoDB,
        partitionKey: "tagID",
        table: "my-table-name"
    }
);

const tag = "database/file13";
const fileStamp = Buffer.from("29", "hex"); // illustration only (use random Buffer)

await ack.create(tag, fileStamp);
```

Next, each file is broken up into words. Here comes the tricky part. We are going to do a lot of things at once.

First, we already registered the start of file processing via `ack.create(...)`, now, we will acknowledge finishing the processing of that file. To acknowledge, we will send the `fileStamp` again (remember `A ^ A = 0`).

Second, at the same time, we will acknowledge _starting_ the processing of each word. Let's say we have `word1`, `word2`, `word3`. We will generate a stamp for each word, so `word1Stamp`, `word2Stamp` and `word3Stamp`. To acknowledge the _starting_ of the processing we will send those word stamps to the acker.

Now, remember that `A ^ A ^ B ^ C ^ D = 0 ^ B ^ C ^ D = B ^ C ^ D`. More precisely:

```javascript
const fileStamp = Buffer.from("29", "hex"); // we mark completing file
// 00101001
const word1Stamp = Buffer.from("25", "hex"); // we mark start of computing word1
// 00100101
const word2Stamp = Buffer.from("a9", "hex"); // we mark start of computing word2
// 10101001
const word3Stamp = Buffer.from("e9", "hex"); // we mark start of computing word3
// 11101001

const xorOfAll = Buffer.from("4c", "hex"); // // fileStamp XOR word1Stamp XOR word2Stamp XOR word3Stamp
// 01001100

await ack.stamp(tag, xorOfAll); // we stamp with just one stamp for all ops above
```

At this point, what happened inside of `ack.stamp(...)` is the XOR of previous state with the newly stamped one.

```javascript
const previousStamp = Buffer.from("29", "hex"); // original fileStamp
// 00101001
const inboundStamp = Buffer.from("4c", "hex"); // xorOfAll from above
// 01001100

let currentState = Buffer.from("65", "hex"); // previousStamp XOR inboundStamp
// 01100101
```

So, we've managed to acknowledge multiple operations all at once, and we are still storing only the `currentState`.

Next, notice what happens as we successfully process each word.

```javascript
let currentState = Buffer.from("65", "hex"); // currentState from above
// 01100101

const word1Stamp = Buffer.from("25", "hex"); // we mark finishing of word1
// 00100101
await ack.stamp(tag, word1Stamp);

currentState = Buffer.from("40", "hex"); // currentState XOR word1Stamp
// 01000000

const word2Stamp = Buffer.from("a9", "hex"); // we mark finishing of word2
// 10101001
await ack.stamp(tag, word2Stamp);

currentState = Buffer.from("e9", "hex"); // currentState XOR word2Stamp
// 11101001

const word3Stamp = Buffer.from("e9", "hex"); // we mark finishing of word3
// 11101001
await ack.stamp(tag, word3Stamp);

currentState = Buffer.from("00", "hex"); // currentState XOR word3Stamp
// 00000000
```

That's it. The XOR math works out really well for tracking these types of computation where one event generates multiple child events. This can keep going further down the chain as long as we acknowledge completing our parent processing together with initiation of any child processing. Despite all that activity, the amount of information we store is always one state per entire ack chain.

The above example used specifically crafted buffers for illustrative purposes. The real implementation uses random buffers. Additionally, **the stamps need to be sufficiently large and random to prevent erronous `acked` events.** Storm implementation found a 64bit random integer to be sufficient in practice.

## Installation

    npm install xor-ack-dynamodb

## Tests

    npm test

## Usage

```javascript
const assert = require("assert").strict;
const AWS = require("aws-sdk");
const crypto = require("crypto");
const XorAckDynamoDB = require("xor-ack-dynamodb");

const dynamoDB = new AWS.DynamoDB.DocumentClient(
    {
        region: "us-east-1"
    }
);

const ack = new XorAckDynamoDB(
    {
        dynamoDB,
        partitionKey: "tagID",
        table: "my-table-name"
    }
);

const tag = "database/file13";
const fileStamp = crypto.randomBytes(64);

let stamp = await ack.create(tag, fileStamp);
assert.ok(!stamp.acked);

const word1Stamp = crypto.randomBytes(64);
const word2Stamp = crypto.randomBytes(64);
const word3Stamp = crypto.randomBytes(64);

let newStamp = XorAckDynamoDB.xor(fileStamp, word1Stamp, word2Stamp, word3Stamp);
stamp = await ack.stamp(tag, newStamp);
assert.ok(!stamp.acked);

newStamp = XorAckDynamoDB.xor(word1Stamp, word2Stamp, word3Stamp);
stamp = await ack.stamp(tag, newStamp);
assert.ok(stamp.acked);
```

### Errors

```javascript
const XorAckDynamoDB = require("xor-ack-dynamodb");
const errors = require("xor-ack-dynamodb/errors");

try
{
    await XorAckDynamoDB.xor();
}
catch (error)
{
    if (error instanceof errors.LessThanTwoBuffers)
    {
        console.log(error.message);
    }
    else
    {
        throw error;
    }
}
```

## Documentation

  * [XorAckDynamoDB](#xorackdynamodb)
  * [errors](#errors-1)

### XorAckDynamoDB

**Public API**
  * [XorAckDynamoDB.xor(...stamps)](#xorackdynamodbxorstamps)
  * [new XorAckDynamoDB(config)](#new-xorackdynamodbconfig)
  * [xorAckDynamoDB.create(tag, stamp)](#xorackdynamodbcreatetag-stamp)
  * [xorAckDynamoDB.delete(tag)](#xorackdynamodbdeletetag)
  * [xorAckDynamoDB.stamp(tag, stamp)](#xorackdynamodbstamptag-stamp)

#### XorAckDynamoDB.xor(...stamps)

  * `...stamps`: _Buffer_ Buffers to XOR.
  * Return: _Buffer_ The XOR result.
    * `acked`: _Boolean_ `true` if result is all zeros, `false` otherwise.
  * Throws:
    * `[BufferLengthsUnequal](#bufferlengthsunequal)`
    * `[LessThanTwoBuffers](#lessthantwobuffers)`

Performs binary XOR operation across all `stamps`. Throws if buffer lengths are unequal or if less than two buffers are specified.

#### new XorAckDynamoDB(config)

  * `config`: _Object_ Configuration.
    * `dynamoDB`: _AWS.DynamoDB.DocumentClient_ Instance of AWS DynamoDB DocumentClient.
    * `partitionKey`: _String_ Name of table partition key to use.
    * `table`: _String_ Name of table to use to store ack chains.

Creates a new `XorAckDynamoDB` instance.

#### xorAckDynamoDB.create(tag, stamp)

  * `tag`: _String_ A unique identifier to track this ack chain.
  * `stamp`: _Buffer_ Initial buffer stamp to create ack chain with.
  * Return: _Buffer_ `stamp`.
    * `acked`: _Boolean_ `false`.
  * Throws:
    * `[TagExists](#tagexists)`
    * `[ZeroBufferNoOp](#zerobuffernoop)`
    * DynamoDB.DocumentClient error

Creates a new ack chain for specified `tag`.

#### xorAckDynamoDB.delete(tag)

  * `tag`: _String_ Identifier of ack chain delete.
  * Throws:
    * `[TagNotFound](#tagnotfound)`
    * DynamoDB.DocumentClient error

Deletes ack chain specified by `tag`.

#### xorAckDynamoDB.stamp(tag, stamp)

  * `tag`: _String_ Identifier to update.
  * `stamp`: _Buffer_ Stamp to XOR with existing stamp.
  * Return: _Buffer_ XOR result of `stamp` and existing stamp.
    * `acked`: _Boolean_ _Boolean_ `true` if XOR result is all zeros, `false` otherwise.
  * Throws:
    * `[StaleLocalData](#stalelocaldata)`
    * `[ZeroBufferNoOp](#zerobuffernoop)`
    * DynamoDB.DocumentClient error

Updates ack chain for specified `tag` by XOR'ing existing stamp with provided `stamp`.

### Errors

#### BufferLengthsUnequal

Attempted to XOR buffers of different lengths. This is probably a programming bug.

#### LessThanTwoBuffers

Attempted to XOR less than two buffers. This is probably a programming bug.

#### StaleLocalData

When attempting `stamp()`, it means that the `stamp` stored in the datastore changed since it was retrieved by the module to perform the `stamp()` operation. This is a transient condition and part of normal operation. Retries should be attempted until success.

#### TagExists

When attempting `create()`, it means that the specified `tag` already exists. This is probably a programming bug.

#### TagNotFound

When attempting `delete()`, it means that the specified `tag` does not exist in the datastore.

#### ZeroBufferNoOp

Attempted to create or stamp an existing tag with a buffer that contains all zeros. This is a no-op and probably a programming bug.

## Releases

[Current releases](https://github.com/tristanls/xor-ack-dynamodb/releases).

### Policy

We follow the semantic versioning policy ([semver.org](http://semver.org/)) with a caveat:

> Given a version number MAJOR.MINOR.PATCH, increment the:
>
>MAJOR version when you make incompatible API changes,<br/>
>MINOR version when you add functionality in a backwards-compatible manner, and<br/>
>PATCH version when you make backwards-compatible bug fixes.

**caveat**: Major version zero is a special case indicating development version that may make incompatible API changes without incrementing MAJOR version.

## References

* [Guaranteeing message processing](http://storm.apache.org/releases/current/Guaranteeing-message-processing.html)
