// Register Babel for .ts/.tsx/.js/.jsx tests so frontend code (TypeScript)
// can be imported directly in tape test files.
require('@babel/register')({
    extensions: ['.ts', '.tsx', '.js', '.jsx'],
});
