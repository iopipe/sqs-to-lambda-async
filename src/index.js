import _ from 'lodash';
import AWS from 'aws-sdk';
import pForever from 'p-forever';
import pSettle from 'p-settle';

const debug = require('debug')('sqs-to-lambda-async');

let sqs = undefined;
let lambda = undefined;

function handleMessage(message = {}, kwargs = {}) {
  return new Promise((resolve, reject) => {
    debug(`Incoming message: ${JSON.stringify(message)}`);
    const { MessageFormatter, FunctionName, DeleteMessage, QueueUrl } = kwargs;
    //no sqs message to process
    if (_.isEmpty(message)) {
      return resolve('Message is empty');
    }
    if (typeof MessageFormatter !== 'function') {
      return reject('Message formatter is not a function.');
    }
    if (typeof FunctionName !== 'string') {
      return reject('Function ARN not valid.');
    }
    const Payload = JSON.stringify(MessageFormatter(message));
    debug(`Invoking lambda ${FunctionName}`);
    return lambda.invoke(
      {
        InvocationType: 'Event',
        FunctionName,
        Payload
      },
      (err, res) => {
        if (err) {
          return reject(err);
        }
        if (DeleteMessage) {
          return sqs.deleteMessage(
            {
              QueueUrl,
              ReceiptHandle: message.ReceiptHandle
            },
            deleteMessageErr => {
              return deleteMessageErr ? reject(deleteMessageErr) : resolve(res);
            }
          );
        }
        return resolve(res);
      }
    );
  });
}

function receiveMessages(kwargs = {}) {
  return new Promise(resolve => {
    const recieveArgs = _.chain(kwargs)
      .pick([
        'MaxNumberOfMessages',
        'QueueUrl',
        'WaitTimeSeconds',
        'VisibilityTimeout'
      ])
      .pickBy()
      .value();
    sqs.receiveMessage(recieveArgs, (err, data) => {
      const messages = _.isArray(data.Messages) ? data.Messages : [];
      pSettle(
        messages.map(msg => {
          return handleMessage(msg, kwargs);
        })
      ).then(resolve);
    });
  });
}

function handleLambdaCallback(kwargs, values = []) {
  const { OnLambda } = kwargs;
  if (_.isArray(values) && _.isFunction(OnLambda)) {
    try {
      values.forEach((obj = {}) => {
        return obj.isRejected
          ? OnLambda(obj.reason || new Error('Unknown lambda error.'))
          : OnLambda(undefined, obj.value);
      });
    } catch (err) {
      _.noop();
    }
  }
}

function createReader(kwargs) {
  debug(`Creating reader with args: ${JSON.stringify(kwargs)}`);
  let readerIndex = -1;
  return pForever(previousVal => {
    handleLambdaCallback(kwargs, previousVal);
    readerIndex++;
    return readerIndex < kwargs.NumberOfRuns
      ? receiveMessages(kwargs)
      : pForever.end;
  }, []);
}

function setupServices() {
  debug('Setting up AWS services');
  sqs = new AWS.SQS();
  lambda = new AWS.Lambda();
}

module.exports = async function run(mapping = []) {
  debug(`Initializing with mapping ${JSON.stringify(mapping)}`);
  try {
    const mappingIsValid = _.chain(mapping)
      .map((obj = {}) => {
        return _.every([obj.functionName, obj.queueUrl]);
      })
      .every()
      .value();
    if (!_.isArray(mapping) || !mapping.length || !mappingIsValid) {
      throw new Error(
        `Your sqs/lambda mapping object must be an array of objects like {functionName: foo, queueUrl: bar}, got ${JSON.stringify(
          mapping
        )}`
      );
    }
    // we use this really only for mocking/testing purposes
    setupServices();
    const readers = mapping.map(obj => {
      // capitalize obj keys for ease of use later
      const msgArgs = _.chain(obj)
        .mapKeys((val, key) => _.camelCase(key))
        .defaults({
          maxNumberOfMessages: 5,
          waitTimeSeconds: 5,
          messageFormatter: a => a,
          numberOfRuns: Infinity,
          deleteMessage: false,
          onLambda: _.noop
        })
        .mapKeys((val, key) => _.upperFirst(key))
        .value();
      return createReader(msgArgs);
    });
    await Promise.all(readers);
  } catch (err) {
    throw err;
  }
};
