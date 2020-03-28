/*

index.test.js

The MIT License (MIT)

Copyright (c) 2020 Tristan Slominski

Permission is hereby granted, free of charge, to any person
obtaining a copy of this software and associated documentation
files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use,
copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following
conditions:

The above copyright notice and this permission notice shall be
included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES
OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND
NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT
HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY,
WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING
FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR
OTHER DEALINGS IN THE SOFTWARE.

*/
"use strict";

jest.mock("aws-sdk");
const awsSDK = require("aws-sdk");

const countdown = require("./test/countdown.js");
const errors = require("./errors");

const XorAckDynamoDB = require("./index.js");

const INSTANTIATED_CONFIG = require("./test/config/instantiated.js");

let ack;

describe("create(tag, stamp)", () =>
{
    let dynamoDB;
    beforeEach(() =>
        {
            dynamoDB =
            {
                delete() {},
                get() {},
                put() {}
            };
        }
    );
    describe("stamp is a zero buffer", () =>
    {
        it("throws ZeroBufferNoOp", async () =>
            {
                ack = new XorAckDynamoDB(
                    {
                        dynamoDB,
                        ...INSTANTIATED_CONFIG
                    }
                );
                try
                {
                    await ack.create("foo", Buffer.alloc(2));
                    expect("no error").toBe("error thrown");
                }
                catch (error)
                {
                    expect(error).toBeInstanceOf(errors.ZeroBufferNoOp);
                    expect(error.message).toBe("Buffer is all zeros");
                    expect(error.code).toBe("ZeroBufferNoOp");
                }
            }
        );
    });
    describe("creates a new tag with the initial XOR stamp", () =>
    {
        it("if error, throws error", async () =>
            {
                const err = new Error("boom");
                ack = new XorAckDynamoDB(
                    {
                        dynamoDB: Object.assign(dynamoDB,
                            {
                                put(params)
                                {
                                    expect(params).toEqual(
                                        {
                                            TableName: INSTANTIATED_CONFIG.table,
                                            Item:
                                            {
                                                [INSTANTIATED_CONFIG.partitionKey]: "foo",
                                                stamp: Buffer.from("02", "hex")
                                            },
                                            ReturnConsumedCapacity: "TOTAL",
                                            ConditionExpression: `attribute_not_exists(#${INSTANTIATED_CONFIG.partitionKey})`,
                                            ExpressionAttributeNames:
                                            {
                                                [`#${INSTANTIATED_CONFIG.partitionKey}`]: INSTANTIATED_CONFIG.partitionKey
                                            }
                                        }
                                    );
                                    return (
                                        {
                                            promise: () => Promise.reject(err)
                                        }
                                    );
                                }
                            }
                        ),
                        ...INSTANTIATED_CONFIG
                    }
                );
                try
                {
                    await ack.create("foo", Buffer.from("02", "hex"));
                    expect("no error").toBe("error thrown");
                }
                catch (error)
                {
                    expect(error).toBe(err);
                }
            }
        );
        it("if ConditionalCheckFailedException error, throws Conflict error", async () =>
            {
                const err = new Error("boom");
                err.code = "ConditionalCheckFailedException";
                ack = new XorAckDynamoDB(
                    {
                        dynamoDB: Object.assign(dynamoDB,
                            {
                                put: () => (
                                    {
                                        promise: () => Promise.reject(err)
                                    }
                                )
                            }
                        ),
                        ...INSTANTIATED_CONFIG
                    }
                );
                try
                {
                    await ack.create("foo", Buffer.from("02", "hex"));
                    expect("no error").toBe("error thrown");
                }
                catch (error)
                {
                    expect(error).toBeInstanceOf(errors.TagExists);
                    expect(error.message).toBe(`"foo" already exists`);
                    expect(error.code).toBe("TagExists");
                }
            }
        );
        it("if no error, returns stamp with acked set to false", async () =>
            {
                ack = new XorAckDynamoDB(
                    {
                        dynamoDB: Object.assign(dynamoDB,
                            {
                                put: () => (
                                    {
                                        promise: () => Promise.resolve(
                                            {
                                                ConsumedCapacity:
                                                {
                                                    CapacityUnits: 2,
                                                    TableName: INSTANTIATED_CONFIG.table
                                                }
                                            }
                                        )
                                    }
                                )
                            }
                        ),
                        ...INSTANTIATED_CONFIG
                    }
                );
                const resp = await ack.create("foo", Buffer.from("02", "hex"));
                expect(resp).toEqual(
                    Object.assign(Buffer.from("02", "hex"),
                        {
                            acked: false
                        }
                    )
                );
            }
        );
    });
});

describe("delete(tag)", () =>
{
    let dynamoDB;
    beforeEach(() =>
        {
            dynamoDB =
            {
                delete() {},
                get() {},
                put() {}
            };
        }
    );
    describe("deletes existing tag", () =>
    {
        it("if error, throws error", async () =>
            {
                const err = new Error("boom");
                ack = new XorAckDynamoDB(
                    {
                        dynamoDB: Object.assign(dynamoDB,
                            {
                                delete(params)
                                {
                                    expect(params).toEqual(
                                        {
                                            TableName: INSTANTIATED_CONFIG.table,
                                            Key:
                                            {
                                                [INSTANTIATED_CONFIG.partitionKey]: "foo",
                                            },
                                            ReturnConsumedCapacity: "TOTAL",
                                            ConditionExpression: `attribute_exists(#${INSTANTIATED_CONFIG.partitionKey})`,
                                            ExpressionAttributeNames:
                                            {
                                                [`#${INSTANTIATED_CONFIG.partitionKey}`]: INSTANTIATED_CONFIG.partitionKey
                                            }
                                        }
                                    );
                                    return (
                                        {
                                            promise: () => Promise.reject(err)
                                        }
                                    );
                                }
                            }
                        ),
                        ...INSTANTIATED_CONFIG
                    }
                );
                try
                {
                    await ack.delete("foo");
                    expect("no error").toBe("error thrown");
                }
                catch (error)
                {
                    expect(error).toBe(err);
                }
            }
        );
        it("if ConditionalCheckFailedException error, throws Conflict error", async () =>
            {
                const err = new Error("boom");
                err.code = "ConditionalCheckFailedException";
                ack = new XorAckDynamoDB(
                    {
                        dynamoDB: Object.assign(dynamoDB,
                            {
                                delete: () => (
                                    {
                                        promise: () => Promise.reject(err)
                                    }
                                )
                            }
                        ),
                        ...INSTANTIATED_CONFIG
                    }
                );
                try
                {
                    await ack.delete("foo");
                    expect("no error").toBe("error thrown");
                }
                catch (error)
                {
                    expect(error).toBeInstanceOf(errors.TagNotFound);
                    expect(error.message).toBe(`"foo" does not exist`);
                    expect(error.code).toBe("TagNotFound");
                }
            }
        );
        it("if no error, does not throw", async () =>
            {
                ack = new XorAckDynamoDB(
                    {
                        dynamoDB: Object.assign(dynamoDB,
                            {
                                delete: () => (
                                    {
                                        promise: () => Promise.resolve(
                                            {
                                                ConsumedCapacity:
                                                {
                                                    CapacityUnits: 2,
                                                    TableName: INSTANTIATED_CONFIG.table
                                                }
                                            }
                                        )
                                    }
                                )
                            }
                        ),
                        ...INSTANTIATED_CONFIG
                    }
                );
                await ack.delete("foo");
            }
        );
    });
});

describe("stamp(tag, stamp)", () =>
{
    let dynamoDB;
    beforeEach(() =>
        {
            dynamoDB =
            {
                delete() {},
                get() {},
                put() {}
            };
        }
    );
    describe("stamp is a zero buffer", () =>
    {
        it("throws ZeroBufferNoOp", async () =>
            {
                ack = new XorAckDynamoDB(
                    {
                        dynamoDB,
                        ...INSTANTIATED_CONFIG
                    }
                );
                try
                {
                    await ack.stamp("foo", Buffer.alloc(2));
                    expect("no error").toBe("error thrown");
                }
                catch (error)
                {
                    expect(error).toBeInstanceOf(errors.ZeroBufferNoOp);
                    expect(error.message).toBe("Buffer is all zeros");
                    expect(error.code).toBe("ZeroBufferNoOp");
                }
            }
        );
    });
    describe("retrieves current XOR stamp for tag", () =>
    {
        it("if error, throws error", async () =>
            {
                const err = new Error("boom");
                ack = new XorAckDynamoDB(
                    {
                        dynamoDB: Object.assign(dynamoDB,
                            {
                                get(params)
                                {
                                    expect(params).toEqual(
                                        {
                                            Key:
                                            {
                                                [INSTANTIATED_CONFIG.partitionKey]: "foo"
                                            },
                                            TableName: INSTANTIATED_CONFIG.table,
                                            ReturnConsumedCapacity: "TOTAL",
                                            ConsistentRead: true
                                        }
                                    );
                                    return (
                                        {
                                            promise: () => Promise.reject(err)
                                        }
                                    );
                                }
                            }
                        ),
                        ...INSTANTIATED_CONFIG
                    }
                );
                try
                {
                    await ack.stamp("foo", Buffer.from("02", "hex"));
                    expect("no error").toBe("error thrown");
                }
                catch (error)
                {
                    expect(error).toBe(err);
                }
            }
        );
        describe("XOR retrieved stamp with incoming stamp", () =>
        {
            beforeEach(() =>
                {
                    dynamoDB = Object.assign(dynamoDB,
                        {
                            get: () => (
                                {
                                    promise: () => Promise.resolve(
                                        {
                                            Item:
                                            {
                                                [INSTANTIATED_CONFIG.partitionKey]: "foo",
                                                stamp: Buffer.from("02", "hex")
                                            },
                                            ConsumedCapacity:
                                            {
                                                CapacityUnits: 2,
                                                TableName: INSTANTIATED_CONFIG.table
                                            }
                                        }
                                    )
                                }
                            )
                        }
                    );
                }
            );
            it("if different stamp length, throws", async () =>
                {
                    ack = new XorAckDynamoDB(
                        {
                            dynamoDB,
                            ...INSTANTIATED_CONFIG
                        }
                    );
                    try
                    {
                        await ack.stamp("foo", Buffer.from("0202", "hex"));
                        expect("no error").toBe("error thrown");
                    }
                    catch (error)
                    {
                        expect(error).toBeInstanceOf(errors.BufferLengthsUnequal);
                    }
                }
            );
            describe("XOR results in non-zero buffer", () =>
            {
                let stamp = Buffer.from("20", "hex");
                describe("atomically puts updated stamp", () =>
                {
                    it("if non-ConditionalCheckFailedException error, throws error", async () =>
                        {
                            const err = new Error("boom");
                            dynamoDB = Object.assign(dynamoDB,
                                {
                                    put(params)
                                    {
                                        expect(params).toEqual(
                                            {
                                                TableName: INSTANTIATED_CONFIG.table,
                                                Item:
                                                {
                                                    [INSTANTIATED_CONFIG.partitionKey]: "foo",
                                                    stamp: Buffer.from("22", "hex")
                                                },
                                                ReturnConsumedCapacity: "TOTAL",
                                                ConditionExpression: `attribute_exists(#${INSTANTIATED_CONFIG.partitionKey}) and #stamp = :stamp`,
                                                ExpressionAttributeNames:
                                                {
                                                    [`#${INSTANTIATED_CONFIG.partitionKey}`]: INSTANTIATED_CONFIG.partitionKey,
                                                    "#stamp": "stamp"
                                                },
                                                ExpressionAttributeValues:
                                                {
                                                    ":stamp": Buffer.from("02", "hex")
                                                }
                                            }
                                        );
                                        return (
                                            {
                                                promise: () => Promise.reject(err)
                                            }
                                        );
                                    }
                                }
                            );
                            ack = new XorAckDynamoDB(
                                {
                                    dynamoDB,
                                    ...INSTANTIATED_CONFIG
                                }
                            );
                            try
                            {
                                await ack.stamp("foo", stamp);
                                expect("no error").toBe("error thrown");
                            }
                            catch (error)
                            {
                                expect(error).toBe(err);
                            }
                        }
                    );
                    it("if ConditionalCheckFailedException error, throws Conflict error", async () =>
                        {
                            const err = new Error("boom");
                            err.code = "ConditionalCheckFailedException";
                            dynamoDB = Object.assign(dynamoDB,
                                {
                                    put(params)
                                    {
                                        return (
                                            {
                                                promise: () => Promise.reject(err)
                                            }
                                        );
                                    }
                                }
                            );
                            ack = new XorAckDynamoDB(
                                {
                                    dynamoDB,
                                    ...INSTANTIATED_CONFIG
                                }
                            );
                            try
                            {
                                await ack.stamp("foo", stamp);
                                expect("no error").toBe("error thrown");
                            }
                            catch (error)
                            {
                                expect(error).toBeInstanceOf(errors.StaleLocalData);
                                expect(error.code).toEqual("StaleLocalData");
                            }
                        }
                    );
                    it("if no error, returns stamp with acked set to false", async () =>
                        {
                            dynamoDB = Object.assign(dynamoDB,
                                {
                                    put(params)
                                    {
                                        return (
                                            {
                                                promise: () => Promise.resolve(
                                                    {
                                                        ConsumedCapacity:
                                                        {
                                                            CapacityUnits: 2,
                                                            TableName: INSTANTIATED_CONFIG.table
                                                        }
                                                    }
                                                )
                                            }
                                        );
                                    }
                                }
                            );
                            ack = new XorAckDynamoDB(
                                {
                                    dynamoDB,
                                    ...INSTANTIATED_CONFIG
                                }
                            );
                            expect(await ack.stamp("foo", stamp)).toEqual(
                                Object.assign(Buffer.from("22", "hex"),
                                    {
                                        acked: false
                                    }
                                )
                            );
                        }
                    );
                });
            });
            describe("XOR results in zero buffer", () =>
            {
                let stamp = Buffer.from("02", "hex");
                describe("atomically deletes stamp", () =>
                {
                    it("if non-ConditionalCheckFailedException error, throws error", async () =>
                        {
                            const err = new Error("boom");
                            dynamoDB = Object.assign(dynamoDB,
                                {
                                    delete(params)
                                    {
                                        expect(params).toEqual(
                                            {
                                                TableName: INSTANTIATED_CONFIG.table,
                                                Key:
                                                {
                                                    [INSTANTIATED_CONFIG.partitionKey]: "foo",
                                                },
                                                ReturnConsumedCapacity: "TOTAL",
                                                ConditionExpression: `attribute_exists(#${INSTANTIATED_CONFIG.partitionKey}) and #stamp = :stamp`,
                                                ExpressionAttributeNames:
                                                {
                                                    [`#${INSTANTIATED_CONFIG.partitionKey}`]: INSTANTIATED_CONFIG.partitionKey,
                                                    "#stamp": "stamp"
                                                },
                                                ExpressionAttributeValues:
                                                {
                                                    ":stamp": Buffer.from("02", "hex")
                                                }
                                            }
                                        );
                                        return (
                                            {
                                                promise: () => Promise.reject(err)
                                            }
                                        );
                                    }
                                }
                            );
                            ack = new XorAckDynamoDB(
                                {
                                    dynamoDB,
                                    ...INSTANTIATED_CONFIG
                                }
                            );
                            try
                            {
                                await ack.stamp("foo", stamp);
                                expect("no error").toBe("error thrown");
                            }
                            catch (error)
                            {
                                expect(error).toBe(err);
                            }
                        }
                    );
                    it("if ConditionalCheckFailedException error, throws Conflict error", async () =>
                        {
                            const err = new Error("boom");
                            err.code = "ConditionalCheckFailedException";
                            dynamoDB = Object.assign(dynamoDB,
                                {
                                    delete(params)
                                    {
                                        return (
                                            {
                                                promise: () => Promise.reject(err)
                                            }
                                        );
                                    }
                                }
                            );
                            ack = new XorAckDynamoDB(
                                {
                                    dynamoDB,
                                    ...INSTANTIATED_CONFIG
                                }
                            );
                            try
                            {
                                await ack.stamp("foo", stamp);
                                expect("no error").toBe("error thrown");
                            }
                            catch (error)
                            {
                                expect(error).toBeInstanceOf(errors.StaleLocalData);
                                expect(error.code).toEqual("StaleLocalData");
                            }
                        }
                    );
                    it("if no error, returns stamp with acked set to true", async () =>
                        {
                            dynamoDB = Object.assign(dynamoDB,
                                {
                                    delete(params)
                                    {
                                        return (
                                            {
                                                promise: () => Promise.resolve(
                                                    {
                                                        ConsumedCapacity:
                                                        {
                                                            CapacityUnits: 2,
                                                            TableName: INSTANTIATED_CONFIG.table
                                                        }
                                                    }
                                                )
                                            }
                                        );
                                    }
                                }
                            );
                            ack = new XorAckDynamoDB(
                                {
                                    dynamoDB,
                                    ...INSTANTIATED_CONFIG
                                }
                            );
                            expect(await ack.stamp("foo", stamp)).toEqual(
                                Object.assign(Buffer.from("00", "hex"),
                                    {
                                        acked: true
                                    }
                                )
                            );
                        }
                    );
                });
            });
        });
    });
});

describe("xor(...stamps)", () =>
{
    test("0x00 XOR 0x00 is 0x00 and acked:true", () =>
        {
            expect(
                XorAckDynamoDB.xor(
                    Buffer.from("00", "hex"),
                    Buffer.from("00", "hex")
                )
            )
            .toEqual(
                Object.assign(Buffer.from("00", "hex"),
                    {
                        acked: true
                    }
                )
            );
        }
    );
    test("0x00 XOR 0x00 XOR 0x00 is 0x00 and acked:true", () =>
        {
            expect(
                XorAckDynamoDB.xor(
                    Buffer.from("00", "hex"),
                    Buffer.from("00", "hex"),
                    Buffer.from("00", "hex")
                )
            )
            .toEqual(
                Object.assign(Buffer.from("00", "hex"),
                    {
                        acked: true
                    }
                )
            );
        }
    );
    test("0x10 XOR 0x01 is 0x11 and acked:false", () =>
        {
            expect(
                XorAckDynamoDB.xor(
                    Buffer.from("10", "hex"),
                    Buffer.from("01", "hex")
                )
            )
            .toEqual(
                Object.assign(Buffer.from("11", "hex"),
                    {
                        acked: false
                    }
                )
            );
        }
    );
    test("0x10 XOR 0x01 XOR 0x02 is 0x13 and acked:false", () =>
        {
            expect(
                XorAckDynamoDB.xor(
                    Buffer.from("10", "hex"),
                    Buffer.from("01", "hex"),
                    Buffer.from("02", "hex")
                )
            )
            .toEqual(
                Object.assign(Buffer.from("13", "hex"),
                    {
                        acked: false
                    }
                )
            );
        }
    );
    test("0x10 XOR 0x10 is 0x00 and acked:true", () =>
        {
            expect(
                XorAckDynamoDB.xor(
                    Buffer.from("10", "hex"),
                    Buffer.from("10", "hex")
                )
            )
            .toEqual(
                Object.assign(Buffer.from("00", "hex"),
                    {
                        acked: true
                    }
                )
            );
        }
    );
    test("0x10 XOR 0x01 XOR 0x11 is 0x00 and acked:true", () =>
        {
            expect(
                XorAckDynamoDB.xor(
                    Buffer.from("10", "hex"),
                    Buffer.from("01", "hex"),
                    Buffer.from("11", "hex")
                )
            )
            .toEqual(
                Object.assign(Buffer.from("00", "hex"),
                    {
                        acked: true
                    }
                )
            );
        }
    );
    test("0x00 XOR 0x0001 throws", () =>
        {
            expect(() => XorAckDynamoDB.xor(
                Buffer.from("00", "hex"),
                Buffer.from("0001", "hex")
            ))
            .toThrow(errors.BufferLengthsUnequal);
        }
    );
    test("0x0001 XOR 0x00 throws", () =>
        {
            expect(() => XorAckDynamoDB.xor(
                Buffer.from("0001", "hex"),
                Buffer.from("00", "hex")
            ))
            .toThrow(errors.BufferLengthsUnequal);
        }
    );
});
