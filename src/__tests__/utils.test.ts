import { webimErrorHandler } from '../utils';

describe('webimErrorHandler', () => {
  it('preserves the native error contract', () => {
    const error = {
      code: 'INVALID_ARGUMENT_VALUE',
      message: 'wrong-argument-value: location',
      userInfo: {
        errorCode: 'INVALID_ARGUMENT_VALUE',
        message: 'wrong-argument-value: location',
        errorType: 'fatal',
      },
    };

    expect(webimErrorHandler(error, false)).toEqual({
      errorCode: 'INVALID_ARGUMENT_VALUE',
      message: 'wrong-argument-value: location',
      errorType: 'fatal',
    });
  });

  it('uses a stable UNKNOWN code for an empty native error', () => {
    expect(webimErrorHandler(null, false)).toEqual({
      errorCode: 'UNKNOWN',
      message: 'Unexpected error',
      errorType: 'common',
    });
  });
});
