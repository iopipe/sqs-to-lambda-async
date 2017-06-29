# SQS to Lambda (Async)

[![styled with prettier](https://img.shields.io/badge/styled_with-prettier-ff69b4.svg)](https://github.com/prettier/prettier)

So you want to trigger a Lambda function via SQS? Great! You might be able to use [sqs-to-lambda](https://github.com/robinjmurphy/sqs-to-lambda). But what if you want your Lambda function to delete the SQS message, instead of the sqs-to-lambda implementation? Or, what if you want to setup multiple SQS => Lambda configurations? That's where this package comes in.

## Requirements
- Node >= `4.3.2`
- NPM >= `2.14.12`

## Install

With [yarn](https://yarnpkg.com) (recommended) in project directory:
```
yarn add sqs-to-lambda-async
```

With npm in project directory:
```
npm install sqs-to-lambda-async
```

Then, run your application:
```
import worker from 'sqs-to-lambda-async';

worker([
  {
    queueUrl: 'sqs-queue-url-here',
    functionName: 'lambda-arn-here'
  }
]);
```

## Config

The package accepts an array of mapping configurations. A mapping configuration is an object with the following properties:

#### `queueUrl` (string: required)

The SQS queue you want to pull from.

#### `functionName` (string: required)

The Lambda function you want to execute.

#### `messageFormatter` (function: optional)

A function that allows transformation of the message before send to Lambda.

#### `deleteMessage` (boolean: optional, default = false)

Use this flag to allow this package to delete the message for you, instead of your Lambda function.

#### `maxNumberOfMessages` (integer: optional, default = 5)

The maximum number of messages to return. [AWS Documenation](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html)

#### `waitTimeSeconds` (integer: optional, default = 5)

The duration (in seconds) for which the call waits for a message to arrive in the queue before returning. [AWS Documenation](http://docs.aws.amazon.com/AWSSimpleQueueService/latest/APIReference/API_ReceiveMessage.html)

## Contributing
- This project uses [Prettier](https://github.com/prettier/prettier). Please execute `npm run eslintFix` to auto-format the code before submitting pull requests.
