import gql from "graphql-tag";

export default class RepositoriesRepository {
  constructor({ client }) {
    this.client = client;
  }

  fetchAll() {
    return new Promise((resolve, reject) => {
      this.client.query({ query: FETCH_REPOSITORIES })
        .then(resolve)
        .catch(reject);
    })
  };
}

export const FETCH_REPOSITORIES = gql`
  query Repositories {
    viewer {
      repositories(
        first: 100,
        affiliations: [
          OWNER,
          COLLABORATOR,
          ORGANIZATION_MEMBER
        ],
        orderBy: {
          field: UPDATED_AT,
            direction: DESC
        }
      ) {
        nodes {
          id
          name
          nameWithOwner
          releases(first: 1, orderBy: {field: CREATED_AT, direction: DESC}) {
            nodes {
              id
              publishedAt
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
`;
