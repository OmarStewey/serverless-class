const { DynamoDB } = require("@aws-sdk/client-dynamodb")
const { unmarshall } = require("@aws-sdk/util-dynamodb")
const dynamodb = new DynamoDB()

const defaultResults = process.env.defaultResults || 8;
const tableName = process.env.restaurants_table;

const getRestaurants = async (count) => {
    console.log(`fetching ${count} restaurants from ${tableName}...`);
    const req = {
        TableName: tableName,
        Limit: count
    };

    const resp = await dynamodb.scan(req);
    console.log(`found ${resp.Items.length} restaurants`);
    return resp.Items.map(x => unmarshall(x));
}

module.exports.handler = async (event, context) => {
    const restaurants = await getRestaurants(defaultResults);
    const response = {
        statusCode: 200,
        body: JSON.stringify(restaurants)
    };

    return response;
}