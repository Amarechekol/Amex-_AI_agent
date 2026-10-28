# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Vercel deployment

This application uses Create React App, not Next.js. The root `vercel.json` selects Vercel's Create React App framework preset. In the Vercel project settings, set **Root Directory** to `.` (the repository root containing `package.json`). Build with `npm run build`; the production output is in `build`.

## Supabase authentication

The Sign in button uses Supabase Auth with email and password. In Supabase, create a project and enable the Email provider under **Authentication → Providers**. Then set these environment variables:

```text
REACT_APP_SUPABASE_URL=https://your-project.supabase.co
REACT_APP_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
```

For local development, copy `.env.example` to `.env.local`, fill in the values, and restart `npm start`. In Vercel, add both variables to the project's Environment Variables and redeploy. Add your local and production app URLs to the Supabase **Authentication → URL Configuration → Redirect URLs** list so email confirmation can return to the app.

Only use Supabase's publishable/anon key in this browser app; never expose a `service_role` key. The app will show setup guidance and keep sign-in unavailable until both variables are configured.

## OpenAI CI diagnosis

The **Diagnose CI failure** sidebar action switches the composer to CI analysis mode. Paste the test-run logs and submit; it requires a signed-in Supabase user and saves the conversation, including submitted logs, in browser history. The logs are sent to OpenAI, so remove credentials and other sensitive data first. The server-side `/api/diagnose` function uses the OpenAI Responses WebSocket API. It exposes two bounded function tools: `testLogTool` extracts failure context from the submitted logs, and `codeSearchTool` searches source/documentation files in the deployed workspace. Search skips hidden files, dependency/build folders, and files larger than 1 MB. The OpenAI API key is never included in the browser bundle.

Set `OPENAI_API_KEY` as a server environment variable (in `.env.local` for local development or in Vercel Project Settings → Environment Variables for deployment). Keep it out of any `REACT_APP_*` variable. The server also needs the existing `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_ANON_KEY` values to verify signed-in users. Restart the local server or redeploy after changing environment variables.

The request uses the model from the supplied sample (`gpt-6-astra`) with response storage disabled. OpenAI may reject the model if it is not enabled for the configured API account.

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in your browser.

The page will reload when you make changes.\
You may also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can't go back!**

If you aren't satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you're on your own.

You don't have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn't feel obligated to use this feature. However we understand that this tool wouldn't be useful if you couldn't customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).

### Code Splitting

This section has moved here: [https://facebook.github.io/create-react-app/docs/code-splitting](https://facebook.github.io/create-react-app/docs/code-splitting)

### Analyzing the Bundle Size

This section has moved here: [https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size](https://facebook.github.io/create-react-app/docs/analyzing-the-bundle-size)

### Making a Progressive Web App

This section has moved here: [https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app](https://facebook.github.io/create-react-app/docs/making-a-progressive-web-app)

### Advanced Configuration

This section has moved here: [https://facebook.github.io/create-react-app/docs/advanced-configuration](https://facebook.github.io/create-react-app/docs/advanced-configuration)

### Deployment

This section has moved here: [https://facebook.github.io/create-react-app/docs/deployment](https://facebook.github.io/create-react-app/docs/deployment)

### `npm run build` fails to minify

This section has moved here: [https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify](https://facebook.github.io/create-react-app/docs/troubleshooting#npm-run-build-fails-to-minify)
