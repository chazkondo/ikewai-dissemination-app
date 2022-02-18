export class IAppConfig {
    env: {
        name: string;
    };
    appInsights: {
        instrumentationKey: string;
    };
    logging: {
        console: boolean;
        appInsights: boolean;
    };
    aad: {
        requireAuth: boolean;
        tenant: string;
        loginURL: string;
        accessToken: string;
    };
    apiServer: {
        metadata: string;
        rules: string;
    };
}
