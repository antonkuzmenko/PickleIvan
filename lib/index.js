import { dialogflow, Suggestions, LinkOutSuggestion } from "actions-on-google";
import express from "express";
import { json as parseJSON } from "body-parser";
import { config } from "dotenv";
import { ApolloClient } from "apollo-client";
import { InMemoryCache } from "apollo-cache-inmemory";
import { createHttpLink } from "apollo-link-http";
import fetch from "node-fetch";
import { findBestMatch } from "string-similarity";
import { pathOr, path } from "ramda";
import semver from "semver";
import Octokit from "@octokit/rest"

import RepositoriesRepository from "./RepositoriesRepository";
import PullRequestsRepository from "./PullRequestsRepository";
import {
  AppError,
  NoRepositoriesFoundError,
  InsufficientCertaintyError
} from "./Errors";

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
const repositoriesRepository = new RepositoriesRepository(
  { client: new ApolloClient({ link: link, cache: new InMemoryCache() })}
);
const pullRequestsRepository = new PullRequestsRepository({ githubToken: GITHUB_TOKEN });
const octokit = new Octokit();
octokit.authenticate({ type: 'token', token: GITHUB_TOKEN });

app.intent("Release", async conv => {
  const { Version: version, Repository: repository } = conv.parameters;
  const userId = conv.user._id;

  if (userId != USER_ID) {
    conv.close("You are not allowed to perform this action!");
  }

  try {
    const release = await createRelease({ versionPart: version, repository: repository });
    conv.ask(new LinkOutSuggestion({
      name: "the Release",
      url: release.url,
    }));
    conv.close(
      `Release of ${release.owner}/${release.repo} with version ${release.version} has been successfully created!`
    );
  } catch (e) {
    if (e instanceof NoRepositoriesFoundError) {
      conv.close("It seems that you don't have any repos");
      return;
    }
    if (e instanceof InsufficientCertaintyError) {
      conv.ask("Sorry, I can not hear well. Can you repeat the request?. By the way, I found the following repos:");
      conv.ask(e.repositories.map(e => e.name).join(", "));
      conv.ask(new Suggestions("Release"));
      return;
    }
    console.error(e);
    conv.ask(
      "I'm stupid sorry. Failed to create the release.",
      new Suggestions("Release")
    );
  }
});

const createRelease = async ({ versionPart, repository }) => {
  const data = await repositoriesRepository.fetchAll();
  const repositories = pathOr([], ["data", "viewer", "repositories", "nodes"], data);

  if (!repositories.length) throw new NoRepositoriesFoundError();

  const { bestMatch } = findBestMatch(repository, repositories.map(e => e.name));
  const bestMatchRepository = repositories.find(r => r.name === bestMatch.target);
  const currentVer = pathOr("0.0.0", ["releases", "nodes", 0, "tag", "name"], bestMatchRepository);
  const releasePublishedAt = new Date(path(["releases", "nodes", 0, "publishedAt"], bestMatchRepository));

  if (bestMatch.rating < 0.5) {
    throw new InsufficientCertaintyError(
      "I'm so stupid. Can't find the repo. I found the following repos: " + repositories.map(e => e.name).join(", "),
      repositories
    );
  }

  const prs = await pullRequestsRepository.fetchMergedSince({
    tag: currentVer,
    repoNameWithOwner: bestMatchRepository.nameWithOwner
  });
  const [owner, repo] = bestMatchRepository.nameWithOwner.split("/");
  const nextVersion = semver.inc(currentVer, versionPart);
  const name = `Release ${nextVersion}`;
  const body = prs.map(format).join("\n");
  const result = await octokit.repos.createRelease({ owner, repo, name, body, tag_name: nextVersion });

  if (result.status == 201) {
    return { owner, repo, name, prevVersion: currentVer, version: nextVersion, url: result.data.html_url };
  }

  throw new CreateReleaseError();
};

const format = pr => {
  return `- ${pr.title} ([#${pr.number}](${pr.html_url}) by [@${pr.user.login}](${pr.user.html_url}))`;
};

express().use(parseJSON(), app).listen(3000)
