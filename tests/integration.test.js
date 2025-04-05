const request = require('supertest');
const axios = require('axios');
const cheerio = require('cheerio');
const app = require('../app');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);
const { sampleHtmlWithYale } = require('./test-utils');
const nock = require('nock');

// No need for TEST_PORT, child_process, execAsync, or manual server start/stop

describe('Integration Tests (Testing Real App)', () => {
  beforeAll(() => {
    // Disable all network connections except localhost (supertest needs this)
    nock.disableNetConnect();
    nock.enableNetConnect('127.0.0.1'); // Allow connections to localhost
  });

  afterEach(() => {
    // Clean up nock mocks after each test
    nock.cleanAll();
  });

  afterAll(() => {
    // Re-enable network connections after all tests
    nock.enableNetConnect();
  });

  test('Should replace Yale with Fale in fetched content', async () => {
    // Setup mock for the external request made BY THE APP
    const scope = nock('https://example.com')
      .get('/')
      .reply(200, sampleHtmlWithYale, { 'Content-Type': 'text/html' });

    // Make a request TO OUR APP using supertest
    const response = await request(app) // Pass the actual app instance
      .post('/fetch')
      .send({ url: 'https://example.com/' })
      .expect('Content-Type', /json/)
      .expect(200);

    // Assertions on the response FROM OUR APP
    expect(response.body.success).toBe(true);
    expect(response.body.content).toBeDefined();

    // Verify Yale has been replaced with Fale in text
    const $ = cheerio.load(response.body.content);
    expect($('title').text()).toBe('Fale University Test Page');
    expect($('h1').text()).toBe('Welcome to Fale University');
    expect($('p').first().text()).toContain('Fale University is a private');

    // Verify URLs remain unchanged (or are correctly made absolute by app.js)
    // Check based on your app.js logic which now makes URLs absolute
    expect($('a[href="https://www.yale.edu/about"]').length).toBeGreaterThan(0);
    expect($('img[src="https://www.yale.edu/images/logo.png"]').length).toBeGreaterThan(0);


    // Verify link text is changed
    expect(response.body.content).toContain('>About Fale<');

    // Verify that the nock scope was used (the app made the external request)
    expect(scope.isDone()).toBe(true);
  }, 10000);

  test('Should handle invalid external URLs fetched by the app', async () => {
    // Mock the external request made by the app to fail
    const scope = nock('https://not-a-real-site-for-test.invalid')
      .get('/')
      // Simulate DNS resolution error or connection refused
      .replyWithError({ message: 'getaddrinfo ENOTFOUND not-a-real-site-for-test.invalid', code: 'ENOTFOUND' });

    const response = await request(app)
      .post('/fetch')
      .send({ url: 'https://not-a-real-site-for-test.invalid/' })
      .expect('Content-Type', /json/)
      .expect(500); // Expecting the app to return 500

    expect(response.body.success).toBe(false);
    // Check the error message returned by *your* app's error handler
    expect(response.body.error).toMatch(/Failed to fetch content:.*ENOTFOUND/i);

    expect(scope.isDone()).toBe(true);
  });

   test('Should handle non-HTML content type from external URL', async () => {
    // Mock the external request made by the app returning non-html
    const scope = nock('https://example.com')
      .get('/image.jpg')
      .reply(200, 'binary image data', { 'Content-Type': 'image/jpeg' });

    const response = await request(app)
      .post('/fetch')
      .send({ url: 'https://example.com/image.jpg' })
      .expect('Content-Type', /json/)
      .expect(400); // Expecting the app to return 400 based on content-type check

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid content type');

    expect(scope.isDone()).toBe(true);
  });


  test('Should handle missing URL parameter sent to the app', async () => {
    const response = await request(app)
      .post('/fetch')
      .send({}) // Send empty body
      .expect('Content-Type', /json/)
      .expect(400); // Expecting the app's validation to return 400

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('URL is required');
    // No nock scope needed here as the app rejects before making an external call
  });

   test('Should handle malformed URL parameter sent to the app', async () => {
    const response = await request(app)
      .post('/fetch')
      .send({ url: 'this is not a url' })
      .expect('Content-Type', /json/)
      .expect(400); // Expecting the app's validation to return 400

    expect(response.body.success).toBe(false);
    expect(response.body.error).toBe('Invalid URL');
     // No nock scope needed here
  });
});
