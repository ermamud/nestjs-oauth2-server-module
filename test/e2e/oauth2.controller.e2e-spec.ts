import * as request from 'supertest';
import {Controller, Get, INestApplication, Injectable, UseGuards, ValidationPipe} from "@nestjs/common";
import {Test, TestingModule} from "@nestjs/testing";
import {AuthGuard} from '@nestjs/passport';
import {FixturesLoaderService} from "./fixtures-loader.service";
import {Oauth2Module} from "../../lib/app/oauth2.module";
import {TypeOrmModule} from "@nestjs/typeorm";
import {UserLoaderInterface, UserValidatorInterface} from "../../lib/domain/interface";
import {InvalidUserException, UserInterface} from "../../lib/domain";

@Controller('oauth2-secured')
export class TestSecuredController {
    @Get('me')
    @UseGuards(AuthGuard('access-token'))
    async auth(): Promise<any> {
        return {message: 'hello'};
    }
}

const users: {[s:string]: string} = {
    'alice@change.me': 'alice',
    'bob@change.me': 'bob',
    'kyle@change.me': 'kyle',
};

@Injectable()
export class UserValidator implements UserValidatorInterface {
    async validate(username, password): Promise<UserInterface> {
        if (users[username] !== undefined && users[username] === password) {
            return {
                id: users[username],
                username: users[username],
                email: users[username],
            }
        }

        throw InvalidUserException.withUsernameAndPassword(username, password);
    }
}

@Injectable()
export class UserLoader implements UserLoaderInterface {
    async load(userId: string): Promise<UserInterface> {
        if (users[userId] !== undefined) {
            return {
                id: users[userId],
                username: users[userId],
                email: users[userId],
            }
        }

        throw InvalidUserException.withId(userId);
    }
}

describe('OAuth2 Controller (e2e)', () => {
    let app: INestApplication;

    beforeEach(async () => {
        const moduleFixture: TestingModule = await Test.createTestingModule({
            imports: [
                TypeOrmModule.forRoot({
                    type: 'postgres',
                    host: 'localhost',
                    port: 5432,
                    username: 'postgres',
                    password: 'postgres',
                    database: 'oauth2-server',
                    entities: [process.cwd() + '/lib/**/*.entity{.ts,.js}'],
                    dropSchema: true,
                    synchronize: true
                }),
                Oauth2Module.forRoot({
                    userValidator: new UserValidator(),
                    userLoader: new UserLoader(),
                })
            ],
            providers: [
                FixturesLoaderService,
            ],
            controllers: [
                TestSecuredController,
            ],
        }).compile();

        app = moduleFixture.createNestApplication();
        app.useGlobalPipes(new ValidationPipe({
            transform: true,
        }));
        await app.init();
    });

    describe('POST /oauth2/token "client_credentials"', () => {
        beforeEach(async () => {
            const fixturesLoader: FixturesLoaderService = app.get<FixturesLoaderService>(FixturesLoaderService);
            await fixturesLoader.loadFixtures(__dirname + '/fixtures/client-credentials');
        });

        it.each([
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-1']],
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-2']],
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-1', 'app-2']],
            ['f9f9f9ef-34b3-428e-a742-669aecd6c889', '4Xg6JgvWfmIT3P5cCev2wehH8sWD3lrd', ['app-1']],
            ['051d6291-2ba7-4dd9-8a18-b590b4a9a457', 'YLbvzkTRG40SKMm5DMfoWZD3BRZCV5Dq', ['app-3']],
        ])('Should authenticate client (%s, %s, "[%s]")', (clientId, clientSecret, scopes) => {
            return request(app.getHttpServer())
                .post('/oauth2/token')
                .query({
                    grant_type: 'client_credentials',
                    client_id: clientId,
                    client_secret: clientSecret,
                    exp: ~~((Date.now() + 600000) / 1000),
                    iat: ~~(Date.now() / 1000),
                    scopes: scopes,
                })
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(201)
                .then(response => {
                    expect(response.body.access_token.length).toBe(64);
                    expect(response.body.refresh_token.length).toBe(64);
                    expect(response.body.token_type).toBe('bearer');
                });
        });

        it.each([
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-1']],
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-2']],
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-1', 'app-2']],
            ['f9f9f9ef-34b3-428e-a742-669aecd6c889', '4Xg6JgvWfmIT3P5cCev2wehH8sWD3lrd', ['app-1']],
            ['051d6291-2ba7-4dd9-8a18-b590b4a9a457', 'YLbvzkTRG40SKMm5DMfoWZD3BRZCV5Dq', ['app-3']],
        ])('Should authenticate client without expiration (%s, %s, "[%s]")', (clientId, clientSecret, scopes) => {
            return request(app.getHttpServer())
                .post('/oauth2/token')
                .query({
                    grant_type: 'client_credentials',
                    client_id: clientId,
                    client_secret: clientSecret,
                    scopes: scopes,
                })
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(201)
                .then(response => {
                    expect(response.body.access_token.length).toBe(64);
                    expect(response.body.refresh_token.length).toBe(64);
                    expect(response.body.token_type).toBe('bearer');
                });
        });

        it.each([
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-3']],
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-1', 'app-3']],
            ['f9f9f9ef-34b3-428e-a742-669aecd6c889', '4Xg6JgvWfmIT3P5cCev2wehH8sWD3lrd', ['app-2']],
            ['051d6291-2ba7-4dd9-8a18-b590b4a9a457', 'YLbvzkTRG40SKMm5DMfoWZD3BRZCV5Dq', ['app-1']],
            ['051d6291-2ba7-4dd9-8a18-b590b4a9a457', 'YLbvzkTRG40SKMm5DMfoWZD3BRZCV5Dq', ['app-2']],
            ['051d6291-2ba7-4dd9-8a18-b590b4a9a457', 'YLbvzkTRG40SKMm5DMfoWZD3BRZCV5Dq', ['app-1', 'app-2']],
            ['f9f9f9ef-34b3-428e-a742-669aecd6c889', 'invalid', ['app-1']],
        ])('Fails when scope is invalid (%s, %s, "[%s]")', (clientId, clientSecret, scopes) => {
            return request(app.getHttpServer())
                .post('/oauth2/token')
                .query({
                    grant_type: 'client_credentials',
                    client_id: clientId,
                    client_secret: clientSecret,
                    exp: ~~((Date.now() + 600000) / 1000),
                    iat: ~~(Date.now() / 1000),
                    scopes: scopes,
                })
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(403);
        });

        it.each([
            ['unkown', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-1']],
        ])('Fails the client is unknown or the secret is invalid (%s, %s, "[%s]")', (clientId, clientSecret, scopes) => {
            return request(app.getHttpServer())
                .post('/oauth2/token')
                .query({
                    grant_type: 'client_credentials',
                    client_id: clientId,
                    client_secret: clientSecret,
                    exp: ~~((Date.now() + 600000) / 1000),
                    iat: ~~(Date.now() / 1000),
                    scopes: scopes,
                })
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(401);
        });
    });

    describe('POST /oauth2/token "refresh_token"', () => {
        beforeEach(async () => {
            const fixturesLoader: FixturesLoaderService = app.get<FixturesLoaderService>(FixturesLoaderService);
            await fixturesLoader.loadFixtures(__dirname + '/fixtures/access-token');
        });

        it.each([
            ['TYUIKNBVGSZ345678IUJHGVHJKL', '6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu'],
            ['TYUIOLNBVFTYUJNBVGHYUIL', 'f9f9f9ef-34b3-428e-a742-669aecd6c889', '4Xg6JgvWfmIT3P5cCev2wehH8sWD3lrd'],
        ])('Should renew using the refresh token (%s)', (refreshToken, clientId, clientSecret) => {
            return request(app.getHttpServer())
                .post('/oauth2/token')
                .query({
                    grant_type: 'refresh_token',
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refreshToken
                })
                .set('Accept', 'application/json')
                .expect(201)
                .then(response => {
                    expect(response.body.access_token.length).toBe(64);
                    expect(response.body.refresh_token.length).toBe(64);
                    expect(response.body.token_type).toBe('bearer');
                });
        });

        it.each([
            ['RTNJSHGQHSJDNJSKDLNAJZKEA', '051d6291-2ba7-4dd9-8a18-b590b4a9a457', 'YLbvzkTRG40SKMm5DMfoWZD3BRZCV5Dq'],
            ['unkonwn', '051d6291-2ba7-4dd9-8a18-b590b4a9a457', 'YLbvzkTRG40SKMm5DMfoWZD3BRZCV5Dq'],
            ['TYUIOLNBVFTYUJNBVGHYUIL', '6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu'],
        ])('Should reject past valid or unkown refresh token renewal (%s)', (refreshToken, clientId, clientSecret) => {
            return request(app.getHttpServer())
                .post('/oauth2/token')
                .query({
                    grant_type: 'refresh_token',
                    client_id: clientId,
                    client_secret: clientSecret,
                    refresh_token: refreshToken
                })
                .set('Accept', 'application/json')
                .expect(401);
        });
    });

    describe('AuthGuard(bearer) should secure routes using access tokens', () => {
        beforeEach(async () => {
            const fixturesLoader: FixturesLoaderService = app.get<FixturesLoaderService>(FixturesLoaderService);
            await fixturesLoader.loadFixtures(__dirname + '/fixtures/access-token');
        });

        it.each([
            ['ERTYUIOKJHGFDZSXCFGHYJKNBHYUJ'],
            ['ERTYUIFGHJKLNBVCDFRTYHJK'],
            ['7789OIGBNSJDQKSJDIKNBHYUIO'],
            ['invalid'],
        ])('Reject calls with invalid access tokens (%s)', (accessToken: string) => {
            return request(app.getHttpServer())
                .get('/oauth2-secured/me')
                .auth(accessToken, {type: 'bearer'})
                .set('Accept', 'application/json')
                .expect(401);
        });

        it('Should accept request with valid access token', () => {
            return request(app.getHttpServer())
                .get('/oauth2-secured/me')
                .auth('NHGFVBHYTFGHKOOOONBHK', {type: 'bearer'})
                .set('Accept', 'application/json')
                .expect(200)
                .then(response => {
                    expect(response.body.message).toBe('hello');
                });
        });
    });

    describe('POST /oauth2/token "password"', () => {
        beforeEach(async () => {
            const fixturesLoader: FixturesLoaderService = app.get<FixturesLoaderService>(FixturesLoaderService);
            await fixturesLoader.loadFixtures(__dirname + '/fixtures/password');
        });

        it.each([
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-1'], 'alice@change.me', 'alice'],
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-2'], 'bob@change.me', 'bob'],
            ['6ab1cfab-0b3d-418b-8ca2-94d98663fb6f', '6nV9GGm1pu8OY0HDZ3Y7QsVnxtkb60wu', ['app-1', 'app-2'], 'alice@change.me', 'alice'],
            ['f9f9f9ef-34b3-428e-a742-669aecd6c889', '4Xg6JgvWfmIT3P5cCev2wehH8sWD3lrd', ['app-1'], 'kyle@change.me', 'kyle'],
            ['051d6291-2ba7-4dd9-8a18-b590b4a9a457', 'YLbvzkTRG40SKMm5DMfoWZD3BRZCV5Dq', ['app-3'], 'kyle@change.me', 'kyle'],
        ])('Should authenticate the user with the client (%s, %s, "[%s]", %s, %s)', (clientId, clientSecret, scopes, username, password) => {
            return request(app.getHttpServer())
                .post('/oauth2/token')
                .query({
                    grant_type: 'password',
                    client_id: clientId,
                    client_secret: clientSecret,
                    scopes: scopes,
                    username: username,
                    password: password
                })
                .set('Accept', 'application/json')
                .expect('Content-Type', /json/)
                .expect(201)
                .then(response => {
                    expect(response.body.access_token.length).toBe(64);
                    expect(response.body.refresh_token.length).toBe(64);
                    expect(response.body.token_type).toBe('bearer');
                });
        });
    });

    afterEach(async () => {
        await app.close();
    });
});
