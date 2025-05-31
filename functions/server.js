const path = require("path");
const fastify = require("fastify")({
  logger: false,
});
const csvToJSON = require("csvtojson");
const serverless = require("serverless-http");

// Setup static files
fastify.register(require("@fastify/static"), {
  root: path.join(__dirname, "public"),
  prefix: "/",
});

// Formbody lets us parse incoming forms
fastify.register(require("@fastify/formbody"));

// Multipart handles files from forms
fastify.register(require("@fastify/multipart"));

// View is a templating manager for fastify
fastify.register(require("@fastify/view"), {
  engine: {
    handlebars: require("handlebars"),
  },
  // Path adjusted: 'src/pages' is now directly inside the functions bundle
  root: path.join(__dirname, "..", "src", "pages"),
});

// Helper function to shorten URLs
const regexURL = (fullURL) => {
  const xThreadsRegex = /https?:\/\/(?:www\.)?([^/]+)\/([^/]+)\/[^/]+/;
  const bSkyRegex = /https?:\/\/(\w+\.\w+)\/profile\/(\w+)/;
  const defaultURLRegex = /^(?:https?:\/\/)?(?:[^@\/\n]+@)?(?:www\.)?([^:\/?\n]+)/igm;
  const socialDomains = ['threads.net','threads.com','//x.com'];

  try {
    let shortURL;

    switch(true) {
      case socialDomains.some(domain => fullURL.includes(domain)):
        const xThreadsMatch = xThreadsRegex.exec(fullURL);
        shortURL = `${xThreadsMatch[1]}/${xThreadsMatch[2]}`;
        break;

      case fullURL.includes('bsky.app'):
        const bSkyMatch = bSkyRegex.exec(fullURL);
        shortURL = `${bSkyMatch[1]}/@${bSkyMatch[2]}`;
        break;

      default:
        const defaultURLMatch = fullURL.split(defaultURLRegex);
        shortURL = defaultURLMatch[1];
    }

    return shortURL;
  } catch (error) {
    console.error("Error in regexURL:", error);
    return fullURL;
  }
}

// Function to map CSV data to desired object structure
const mapToObjects = (srcJSON) => {
  if (!Array.isArray(srcJSON)) {
    console.error("Invalid input: srcJSON should be an array.");
    return [];
  }

  return srcJSON.map((item) => {
    const isNotable = item.Notable === "TRUE" || item.Notable === "checked";
    const headlinePunctuation = isNotable ? item.Note.indexOf(".") + 1 : item.Note.indexOf(",");

    return {
      notable: isNotable,
      headline: item.Note.substring(0, headlinePunctuation),
      body: item.Note.substring(headlinePunctuation),
      link: item.URL,
      linkText: item.URL.replace(/^(?:https?:\/\/)?(?:www\.)?/i, ""),
      shortLinkText: regexURL(item.URL),
      paywall: item.Paywall === "checked" ? true : false
    };
  });
};

// Function to transform CSV data
const transformer = async function (csvContent) {
  try {
    const srcJSON = await csvToJSON().fromString(csvContent);
    return mapToObjects(srcJSON);
  } catch (error) {
    console.error("Error in transformer:", error);
    throw error;
  }
}

// Home page route
fastify.get("/", function (request, reply) {
  return reply.view("index.hbs");
});

// POST route to handle file uploads
fastify.post("/", async function (request, reply) {
  let params = {};

  try {
    const file = await request.file();
    if (!file) {
      throw new Error("No file uploaded");
    }

    const fileBuffer = await file.toBuffer();
    const csvContent = fileBuffer.toString('utf8');

    const transformed = await transformer(csvContent);
    // console.log("Transformed data:", transformed);

    params.processedData = transformed;

  } catch (error) {
    let errorMessage = "Error processing file:";
    console.error(errorMessage, error);
    params.error = errorMessage + " " + error.message;
  }

  return reply.view("result.hbs", params);
});

// Export the handler for Netlify Functions
module.exports.handler = serverless(fastify);
