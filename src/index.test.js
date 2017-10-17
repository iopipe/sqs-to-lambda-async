import _ from 'lodash';
import delay from 'delay';
import lib from './index';
import AWS from 'aws-sdk-mock';

const defaultMessages = [
  {
    ReceiptHandle: '1',
    QueueUrl: 'test-1',
    Body: 'A wonderful test body'
  },
  {
    ReceiptHandle: '2',
    QueueUrl: 'test-1',
    Body: 'A truly great test body'
  },
  {
    ReceiptHandle: '3',
    QueueUrl: 'test-2',
    Body: 'A spectacular test body'
  },
  {
    ReceiptHandle: '4',
    QueueUrl: 'test-2',
    Body: 'An awesome test body'
  }
];

let messages = defaultMessages;
let lambdaInvocations = [];

function resetMessages() {
  messages = [].concat(defaultMessages);
}

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
    const keys = ['ReceiptHandle', 'QueueUrl'];
    return _.isEqual(_.pick(m, keys), _.pick(kwargs, keys));
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
    resetMessages();
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

test('Runs successfully when using MessageFormatter', async () => {
  expect.assertions(9);
  try {
    lambdaInvocations = [];
    resetMessages();
    expect(messages.length).toEqual(4);
    expect(lambdaInvocations.length).toEqual(0);
    await lib([
      {
        queueUrl: 'test-1',
        functionName: 'boop',
        numberOfRuns: 1
      },
      {
        queueUrl: 'test-2',
        functionName: 'boop',
        numberOfRuns: 1,
        messageFormatter: obj => {
          return _.assign({}, obj, {
            Body: 'dingDong'
          });
        }
      }
    ]);
    await delay(10);
    // 2 messages * 3 runs total
    expect(lambdaInvocations.length).toBe(4);
    expect(lambdaInvocations[0]).toBeInstanceOf(Object);
    expect(messages.length).toEqual(4);

    expect(typeof lambdaInvocations[0].Payload).toEqual('string');
    const obj = JSON.parse(lambdaInvocations[0].Payload);
    expect(obj.Body).toEqual('A wonderful test body');

    expect(typeof lambdaInvocations[3].Payload).toEqual('string');
    const obj2 = JSON.parse(lambdaInvocations[3].Payload);
    expect(obj2.Body).toEqual('dingDong');
  } catch (err) {
    throw err;
  }
});

test('Does not halt with bad functions', async () => {
  resetMessages();
  expect.assertions(2);
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
  expect(targetErr).toBe(undefined);
});

test('Uses onLambdaComplete function correctly', async () => {
  resetMessages();
  lambdaInvocations = [];
  const settled = [];
  const onLambdaComplete = obj => settled.push(obj);
  await lib([
    {
      queueUrl: 'test-1',
      functionName: 'badFunction',
      numberOfRuns: 1,
      onLambdaComplete
    },
    {
      queueUrl: 'test-1',
      functionName: 'boop',
      numberOfRuns: 1,
      onLambdaComplete
    }
  ]);
  await delay(10);
  expect(settled.length).toBe(4);
  expect(_.filter(settled, { isFulfilled: true }).length).toBe(2);
  expect(_.filter(settled, { isRejected: true }).length).toBe(2);
  expect(_.find(settled, { isFulfilled: true }).value.FunctionName).toBe(
    'boop'
  );
  expect(
    _.find(settled, { isRejected: true }).reason.message.match(
      /bad function yo/
    )
  );
});
