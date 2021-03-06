import { IHttpClient, HttpResponse } from '../HttpClient';
import Scanner from './Scanner';
import Utils from '../Utils';

const MAX_RESULTS_PER_PAGE: number = 50;

interface ITweet {
    id: string;
    text: string;
    created_at: string;
}

interface IGetUserDataResults {
    data: {
        description: string;
        username: string;
        id: string;
        created_at: string;
        public_metrics: {
            followers_count: number;
            following_count: number;
            tweet_count: number;
            listed_count: number;
        };
    }
}

interface IGetUserTweetsResults {
    data: ITweet[];
    meta: {
        next_token?: string;
        result_count: number;
        newest_id: string;
        oldest_id: string;
    }
}

export default class PostsFrequencyScanner extends Scanner {
    protected readonly _scannedElement: string = 'Posts frequency';

    public constructor( private readonly _httpClient: IHttpClient ) {
        super()
    }

    protected async _scan( profile: string ): Promise<string> {
        const getUserDataResults: HttpResponse = await this._httpClient.get(
            `https://api.twitter.com/2/users/by/username/${ profile }?user.fields=created_at,public_metrics`,
            { ...Utils.getTwitterAPIAuthHeaders() }
        );

        const { data } = await getUserDataResults.body.json() as IGetUserDataResults;

        let paginationToken: string | undefined = '';
        const postsFrequencyMap: Map<string,number> = new Map();
        let probablyPlannedPostsCount: number = 0;
        let lastActivityAt: Date = new Date( 0 );
        
        while ( paginationToken !== undefined ) {
            const getUserTweetsResults: HttpResponse = await this._httpClient.get(
                this._getUserTweetsAPIUrl( data.id, paginationToken ),
                { ...Utils.getTwitterAPIAuthHeaders() }
            );

            const { meta, data: tweets } = await getUserTweetsResults.body.json() as IGetUserTweetsResults;

            if ( !tweets?.length ) {
                // Handle a situation when e.g. a rate limit is reached or the profile is empty.
                break;
            }

            if ( paginationToken === '' ) {
                lastActivityAt = new Date( tweets[ 0 ].created_at );
            }

            tweets.map( tweet => {
                const tweetDay: string = tweet.created_at.split('T')[ 0 ];
                const tweetDate: Date = new Date( tweet.created_at );
                const currentFrequency: number = postsFrequencyMap.get( tweetDay ) ?? 0;
                
                // Planner does not allow to set seconds and milliseconds for a scheduled tweet.
                if ( !tweetDate.getSeconds() && !tweetDate.getMilliseconds() ) {
                    probablyPlannedPostsCount++;
                }

                postsFrequencyMap.set( tweetDay, currentFrequency + 1 );
            } );

            paginationToken = meta.next_token;
        }

        const frequencies: number[] = [ ...postsFrequencyMap.values() ];

        const maxTweetsPerDay: number = frequencies.length ? Math.max( ...frequencies ) : 0;
        const averageTweetsPerDay: number = frequencies.length ? Utils.getAverageValue( [ ...frequencies ] ): 0;

        const createdAt: Date = new Date( data.created_at );

        const profileLifetime: number = Utils.getDaysDiff( new Date(), createdAt );

        return `
            <ul class="details__list">
                <li>Last activity at: <strong>${ lastActivityAt.toISOString() }</strong></li>
                <li>Average number of posts in active days: <strong>${ averageTweetsPerDay }</strong> (counts only days where at least one tweet was posted)</li>
                <li>Average number of posts overall: <strong>${ ( data.public_metrics.tweet_count / profileLifetime ).toFixed( 2 ) }</strong> (incl. inactive days)</li>
                <li>Number of inactive days: <strong>${ profileLifetime - [ ...postsFrequencyMap.keys() ].length }</strong> (incl. inactive days)</li>
                <li>Max posts in a single day: <strong>${ maxTweetsPerDay }</strong></li>
                <li>Probably planned posts count: <strong>${ probablyPlannedPostsCount } (${ ( ( probablyPlannedPostsCount / data.public_metrics.tweet_count ) * 100 ).toFixed( 2 ) }%)</strong></li>
            </ul>
        `;
    }

    private _getUserTweetsAPIUrl( id: string, paginationToken?: string ): string {
        let queryParams: string = `?max_results=${ MAX_RESULTS_PER_PAGE }&tweet.fields=created_at`;

        if ( paginationToken ) {
            queryParams = `${ queryParams }&pagination_token=${ paginationToken }`;
        }

        return `https://api.twitter.com/2/users/${ id }/tweets${ queryParams }`;
    }
}