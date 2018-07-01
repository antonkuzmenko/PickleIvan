import prsMergedSince from "prs-merged-since";

export default class PullRequestsRepository {
  constructor({ githubToken }) {
    this.githubApiToken = githubToken;
  }

  async fetchMergedSince({ tag, repoNameWithOwner: repo }) {
    if (tag === "0.0.0") {
      return [];
    }

    const githubApiToken = this.githubApiToken;
    let prs = await prsMergedSince({ repo, tag, githubApiToken });
    prs = prs.filter(pr => new Date(pr.merged_at) > releasePublishedAt);
    prs.sort((prA, prB) => new Date(prA.merged_at) - new Date(prB.merged_at));

    return prs;
  };
}

