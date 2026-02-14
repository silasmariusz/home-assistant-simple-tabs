import typescript from 'rollup-plugin-typescript2';
import commonjs from '@rollup/plugin-commonjs';
import nodeResolve from '@rollup/plugin-node-resolve';
import terser from '@rollup/plugin-terser';
import serve from 'rollup-plugin-serve';

const dev = process.env.ROLLUP_WATCH;

export default {
  input: 'src/fork_u-bubble_simple_tabs.ts',
  output: {
    file: 'fork_u-bubble_simple_tabs.js',
    format: 'es',
    inlineDynamicImports: true,
  },
  plugins: [
    nodeResolve(),
    commonjs(),
    typescript(),
    dev && serve({
      contentBase: '.',
      host: '0.0.0.0',
      port: 5000,
      headers: {
        'Access-Control-Allow-Origin': '*',
      },
    }),
    !dev && terser({ format: { comments: false } }),
  ],
};