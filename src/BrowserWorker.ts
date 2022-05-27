import puppeteer, { Browser } from 'puppeteer';

export default class BrowserWorker {
    private _browser: Browser;

    public async launch(): Promise<void> {
        this._browser = await puppeteer.launch( { args: [ '--no-sandbox' ] } );
    }

    public get browser(): Browser {
        if ( !this._browser ) {
            throw new Error( 'Browser has not been launched!' );
        }

        return this._browser;
    }
}