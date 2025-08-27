import { Logger } from '../src/logger';

describe('Logger', () => {
  let logger: Logger;
  let consoleSpy: jest.SpyInstance;

  beforeEach(() => {
    // Reset singleton instance for isolation
    (Logger as any).instance = undefined;
    logger = Logger.getInstance();
    consoleSpy = jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    consoleSpy.mockRestore();
  });

  it('should be a singleton', () => {
    const anotherLogger = Logger.getInstance();
    expect(logger).toBe(anotherLogger);
  });

  it('should log info messages by default', () => {
    logger.info('test message');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should not log info messages if level is WARN', () => {
    logger.setLogLevel(1); // WARN
    logger.info('test message');
    expect(consoleSpy).not.toHaveBeenCalled();
  });

  it('should log warn messages if level is WARN or lower', () => {
    logger.setLogLevel(1); // WARN
    logger.warn('test message');
    expect(consoleSpy).toHaveBeenCalled();
  });

  it('should log error messages', () => {
    logger.error('test message');
    expect(consoleSpy).toHaveBeenCalled();
  });
});
