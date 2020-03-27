/*

index.js

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

const pkg = require("./package.json");

class XorAckDynamoDB
{
    /*
        * `config`: _Object_ Configuration.
          * `dynamoDB`: _AWS.DynamoDB.DocumentClient_ Instance of AWS DynamoDB DocumentClient.
          * `partitionKey`: _String_ Name of table partition key to use.
          * `table`: _String_ Name of table to use to store ack chains.
    */
    constructor(config)
    {
        const self = this;
        self.name = pkg.name;
        self.version = pkg.version;

        self._config = config;

        const configValidationResult = XorAckDynamoDB.SCHEMA.config.validate(
            self._config,
            {
                abortEarly: false,
                convert: false
            }
        );
        if (configValidationResult.error)
        {
            throw configValidationResult.error
        }
    }

    /*
        * `first`: _Buffer_ First buffer to XOR.
        * `second`: _Buffer_ Second buffer to XOR.
        * Return: _Buffer_ The XOR result.
          * `acked`: _Boolean_ `true` if result is all zeros, `false` otherwise.
        * Throws: _Error_
          * "Buffer lengths are not equal"
    */
    static xor(first, second)
    {
        if (first.length != second.length)
        {
            throw new Error("Buffer lengths are not equal");
        }
        const result = Buffer.allocUnsafe(first.length);
        let allZeros = true;
        for (let i = 0; i < first.length; i++)
        {
            result[i] = first[i] ^ second[i];
            if (result[i] != 0)
            {
                allZeros = false;
            }
        }
        return Object.assign(result,
            {
                acked: allZeros
            }
        );
    }

    /*
      * `tag`: _String_ A unique identifier to track this ack chain.
      * `stamp`: _Buffer_ Initial buffer stamp to create ack chain with.
      * Return: _Buffer_ `stamp`.
        * `acked`: _Boolean_ `false`.
      * Throws: _Error_
        * `{ code: "Bad Request", message: "stamp is a zero buffer" }`
        * `{ code: "Conflict", message: ""${tag}" already exists" }`
        * DynamoDB.DocumentClient error
    */
    async create(tag, stamp)
    {
        const self = this;
        let allZeros = true;
        for (let i = 0; i < stamp.length; i++)
        {
            if (stamp[i] != 0)
            {
                allZeros = false;
                break;
            }
        }
        if (allZeros)
        {
            const error = new Error("stamp is a zero buffer");
            error.code = "Bad Request";
            throw error;
        }
        const params =
        {
            TableName: self._config.table,
            Item:
            {
                [self._config.partitionKey]: tag,
                stamp
            },
            ReturnConsumedCapacity: "TOTAL",
            ConditionExpression: `attribute_not_exists(#${self._config.partitionKey})`,
            ExpressionAttributeNames:
            {
                [`#${self._config.partitionKey}`]: self._config.partitionKey
            }
        };
        try
        {
            await self._config.dynamoDB.put(params).promise();
        }
        catch (error)
        {
            if (error.code == "ConditionalCheckFailedException")
            {
                error = new Error(`"${tag}" already exists`);
                error.code = "Conflict";
                throw error;
            }
            throw error;
        }
        return Object.assign(Buffer.from(stamp),
            {
                acked: false
            }
        );
    }

    /*
      * `tag`: _String_ Identifier of ack chain delete.
    */
    async delete(tag)
    {
        const self = this;
        const params =
        {
            TableName: self._config.table,
            Key:
            {
                [self._config.partitionKey]: tag
            },
            ReturnConsumedCapacity: "TOTAL",
            ConditionExpression: `attribute_exists(#${self._config.partitionKey})`,
            ExpressionAttributeNames:
            {
                [`#${self._config.partitionKey}`]: self._config.partitionKey
            }
        };
        try
        {
            await self._config.dynamoDB.delete(params).promise();
        }
        catch (error)
        {
            if (error.code == "ConditionalCheckFailedException")
            {
                error = new Error(`"${tag}" does not exist`);
                error.code = "Conflict";
                throw error;
            }
            throw error;
        }
    }


    /*
        * `tag`: _String_ Identifier to update.
        * `stamp`: _Buffer_ Stamp to XOR with existing stamp.
        * Return: _Buffer_ XOR result of `stamp` and stored stamp.
          * `acked`: _Boolean_ `true` if XOR result is all zeros, `false` otherwise.
        * Throws: _Error_
          * `{ code: "Bad Request", message: "stamp is a zero buffer" }`
          * `{ code: "Conflict", message: "Conflict" }`
          * DynamoDB.DocumentClient error
    */
    async stamp(tag, stamp)
    {
        const self = this;
        let allZeros = true;
        for (let i = 0; i < stamp.length; i++)
        {
            if (stamp[i] != 0)
            {
                allZeros = false;
                break;
            }
        }
        if (allZeros)
        {
            const error = new Error("stamp is a zero buffer");
            error.code = "Bad Request";
            throw error;
        }
        let params =
        {
            TableName: self._config.table,
            Key:
            {
                [self._config.partitionKey]: tag
            },
            ReturnConsumedCapacity: "TOTAL",
            ConsistentRead: true
        };
        const resp = await self._config.dynamoDB.get(params).promise();
        const current = resp.Item.stamp;
        const updated = XorAckDynamoDB.xor(stamp, current);
        if (updated.acked)
        {
            const params =
            {
                TableName: self._config.table,
                Key:
                {
                    [self._config.partitionKey]: tag
                },
                ReturnConsumedCapacity: "TOTAL",
                ConditionExpression: `attribute_exists(#${self._config.partitionKey}) and #stamp = :stamp`,
                ExpressionAttributeNames:
                {
                    [`#${self._config.partitionKey}`]: self._config.partitionKey,
                    "#stamp": "stamp"
                },
                ExpressionAttributeValues:
                {
                    ":stamp": current
                }
            };
            try
            {
                await self._config.dynamoDB.delete(params).promise();
            }
            catch (error)
            {
                if (error.code == "ConditionalCheckFailedException")
                {
                    error = new Error("Conflict");
                    error.code = "Conflict";
                    throw error;
                }
                throw error;
            }
        }
        else
        {
            const params =
            {
                TableName: self._config.table,
                Item:
                {
                    [self._config.partitionKey]: tag,
                    stamp: updated
                },
                ReturnConsumedCapacity: "TOTAL",
                ConditionExpression: `attribute_exists(#${self._config.partitionKey}) and #stamp = :stamp`,
                ExpressionAttributeNames:
                {
                    [`#${self._config.partitionKey}`]: self._config.partitionKey,
                    "#stamp": "stamp"
                },
                ExpressionAttributeValues:
                {
                    ":stamp": current
                }
            };
            try
            {
                await self._config.dynamoDB.put(params).promise();
            }
            catch (error)
            {
                if (error.code == "ConditionalCheckFailedException")
                {
                    error = new Error("Conflict");
                    error.code = "Conflict";
                    throw error;
                }
                throw error;
            }
        }
        return updated;
    }
}

XorAckDynamoDB.SCHEMA =
{
    config: require("./schema.js")
}

module.exports = XorAckDynamoDB;
