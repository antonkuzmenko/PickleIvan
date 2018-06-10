import { dialogflow, Suggestions } from "actions-on-google";
import express from "express";
import { json as parseJSON } from "body-parser";
import { config } from "dotenv";
import { ApolloClient } from "apollo-client";
import { InMemoryCache } from "apollo-cache-inmemory";
import { createHttpLink } from "apollo-link-http";
import fetch from "node-fetch";
import gql from "graphql-tag";
import { findBestMatch } from "string-similarity";
import { pathOr } from "ramda";
import prsMergedSince from "prs-merged-since";

const dotenvResult = config();
if (dotenvResult.error) throw dotenvResult.error;

const USER_ID = process.env.USER_ID;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

const app = dialogflow();
const link = createHttpLink({
  fetch: fetch,
  uri: "https://api.github.com/graphql",
  headers: { Authorization: `bearer ${GITHUB_TOKEN}` },
});
const client = new ApolloClient({ link: link, cache: new InMemoryCache() });

const fetchRepositories = () => (
  new Promise((resolve, reject) => {
    client.query({
      query: gql`
    query Repositories {
      viewer {
        repositories(first: 100, affiliations: [OWNER, COLLABORATOR, ORGANIZATION_MEMBER], orderBy: {field: UPDATED_AT, direction: DESC}) {
          nodes {
            id
            name
            nameWithOwner
            releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
              nodes {
                id
                tag {
                  id
                  name
                }
              }
            }
          }
        }
      }
    }
  `,
    })
      .then(data => resolve(data))
      .catch(error => reject(error));
  })
);

app.intent("Release", async conv => {
  const { Version: version, Repository: repository } = conv.parameters;
  const userId = conv.user._id;

  if (userId != USER_ID) {
    conv.close("You are not allowed to perform this action!");
  }

  try {
    const data = await fetchRepositories();
    const repositories = pathOr([], ["data", "viewer", "repositories", "nodes"], data);

    if (!repositories.length) {
      conv.close("It seems that you don't have any repos");
    }

    const { bestMatch } = findBestMatch(repository, repositories.map(e => e.name));
    const bestMatchRepository = repositories.find(r => r.name === bestMatch.target);
    const currentVer = pathOr("0.1.0", ["releases", "nodes", 0, "tag", "name"], bestMatchRepository);

    if (bestMatch.rating >= 0.5) {
      if (release(bestMatchRepository.nameWithOwner, currentVer, version)) {
        conv.close(`${bestMatchRepository.nameWithOwner} from ${currentVer} to ${version} release is started`);
      } else {
        conv.ask(
          "I'm stupid sorry. Failed to create the release.",
          new Suggestions("Release")
        );
      }
    } else {
      conv.ask("I'm stupid sorry. Can't find the repo. I found the following repos:");
      conv.ask(repositories.map(e => e.name).join(", "));
      conv.ask(new Suggestions("Release"));
    }
  } catch (e) {
    console.error(e);
    conv.ask(
      "I'm stupid sorry. Failed to create the release.",
      new Suggestions("Release")
    );
  }
});

// TODO: create release
const release = async (repoNameWithOwner, currentVer, verPart) => {
  const prs = await prsMergedSince({
    repo: repoNameWithOwner,
    tag: currentVer,
    githubApiToken: GITHUB_TOKEN,
  });
  console.log(prs);
  return true;
};

express().use(parseJSON(), app).listen(3000)
