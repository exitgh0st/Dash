/**
 * Reddit comment projections. A single service-token read of
 * `/user/{name}/comments` returns a Reddit "listing"; these types describe the
 * raw shape we consume and the trimmed shape we hand back over the Dash API.
 */

/** The fields we read off one `t1_*` (comment) child in a Reddit listing. */
interface RedditCommentData {
  id: string;
  body: string;
  subreddit: string;
  score: number;
  created_utc: number; // epoch *seconds* (Reddit convention)
  permalink: string; // site-relative, e.g. /r/stocks/comments/abc/def/ghi/
}

/** One child entry in a Reddit listing response. */
export interface RedditListingChild {
  kind: string;
  data: RedditCommentData;
}

/** A Reddit listing envelope (`kind: "Listing"`) of comment children. */
export interface RedditListing {
  data: {
    after: string | null; // pagination cursor for the next page, null at the end
    children: RedditListingChild[];
  };
}

/**
 * A comment as returned to the Dash client — trimmed to what the comments view
 * renders, with timestamps and links normalized so the frontend needs no Reddit
 * knowledge.
 */
export interface RedditComment {
  id: string;
  body: string;
  subreddit: string;
  score: number;
  createdUtc: string; // ISO 8601, converted from Reddit's epoch-seconds
  permalink: string; // absolute https://www.reddit.com/... URL
}

/**
 * Map a raw Reddit comment child to the public {@link RedditComment} projection.
 * Converts epoch-seconds → ISO and the site-relative permalink → an absolute URL.
 */
export function toRedditComment(child: RedditListingChild): RedditComment {
  const d = child.data;
  return {
    id: d.id,
    body: d.body,
    subreddit: d.subreddit,
    score: d.score,
    createdUtc: new Date(d.created_utc * 1000).toISOString(),
    permalink: `https://www.reddit.com${d.permalink}`,
  };
}
