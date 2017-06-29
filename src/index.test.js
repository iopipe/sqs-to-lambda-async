import _ from 'lodash';
import delay from 'delay';
import lib from './index';
import AWS from 'aws-sdk-mock';

let messages = [
  {
    ReceiptHandle: '1',
    QueueUrl: 'test-1'
  },
  {
    ReceiptHandle: '2',
    QueueUrl: 'test-1'
  },
  {
    ReceiptHandle: '3',
    QueueUrl: 'test-2'
  },
  {
    ReceiptHandle: '4',
    QueueUrl: 'test-2'
  }
];
let lambdaInvocations = [];

AWS.mock('Lambda', 'invoke', (kwargs, cb) => {
  if (kwargs.FunctionName === 'badFunction') {
    return cb(new Error('That is a bad function yo.'));
  }
  lambdaInvocations.push(kwargs);
  return cb(null, kwargs);
});

AWS.mock('SQS', 'receiveMessage', (kwargs, cb) => {
  return cb(null, {
    Messages: _.filter(messages, m => m.QueueUrl === kwargs.QueueUrl)
  });
});

AWS.mock('SQS', 'deleteMessage', (kwargs, cb) => {
  const newMessages = _.reject(messages, m => {
    return _.isEqual(m, kwargs);
  });
  messages = newMessages;
  return cb(null, true);
});

test('Throws error when setup with no args', async () => {
  expect.assertions(2);
  let targetErr = undefined;
  try {
    await lib();
  } catch (err) {
    targetErr = err;
  }
  expect(targetErr).toBeInstanceOf(Error);
  expect(targetErr.message).toMatch(/must be an array of objects/);
});

test('Throws error when setup with wrong args', async () => {
  expect.assertions(2);
  let targetErr = undefined;
  try {
    await lib([
      {
        queueUrl: 'foo'
      }
    ]);
  } catch (err) {
    targetErr = err;
  }
  expect(targetErr).toBeInstanceOf(Error);
  expect(targetErr.message).toMatch(/must be an array of objects/);
});

test('Runs successfully with good functions', async () => {
  expect.assertions(4);
  try {
    expect(messages.length).toEqual(4);
    expect(lambdaInvocations.length).toEqual(0);
    await lib([
      {
        queueUrl: 'test-1',
        functionName: 'bar',
        numberOfRuns: 1
      },
      {
        queueUrl: 'test-2',
        functionName: 'boop',
        numberOfRuns: 2
      }
    ]);
    await delay(10);
    // 2 messages * 3 runs total
    expect(lambdaInvocations.length).toBe(6);
    expect(lambdaInvocations[0].FunctionName).toEqual('bar');
  } catch (err) {
    throw err;
  }
});

test('Runs successfully when using DeleteMessage', async () => {
  expect.assertions(5);
  try {
    lambdaInvocations = [];
    expect(messages.length).toEqual(4);
    expect(lambdaInvocations.length).toEqual(0);
    await lib([
      {
        queueUrl: 'test-2',
        functionName: 'boop',
        numberOfRuns: 1,
        deleteMessage: true
      }
    ]);
    await delay(10);
    // 2 messages * 3 runs total
    expect(lambdaInvocations.length).toBe(2);
    expect(lambdaInvocations[0].FunctionName).toEqual('boop');
    expect(messages.length).toEqual(2);
  } catch (err) {
    throw err;
  }
});

test('Errors with bad functions', async () => {
  expect.assertions(4);
  let targetErr = undefined;
  try {
    lambdaInvocations = [];
    await lib([
      {
        queueUrl: 'test-1',
        functionName: 'badFunction',
        numberOfRuns: 2
      }
    ]);
    await delay(10);
  } catch (err) {
    targetErr = err;
  }
  expect(lambdaInvocations.length).toBe(0);
  expect(targetErr).toBeDefined();
  expect(targetErr).toBeInstanceOf(Error);
  expect(targetErr.message).toMatch(/is a bad function/);
});
