# gulp-merge-po [![NPM version](https://badge.fury.io/js/gulp-concat-po.png)](https://www.npmjs.org/package/gulp-merge-po)

> Correctly merging i18 .po files.

Country specific files shall contain only the changes specific for country. For given files:

```
src/gettext/es.po
src/gettext/es-MX.po
src/gettext/es-ES.po
```

The [es.po] will be not affected.
The [es-MX.po] will be a merge of [es-MX.po] over [es.po] 

etc.

## Install

1. Install the plugin with the following command:

	```shell
	npm install gulp-merge-po --save-dev
	```


## Usage

```js
var gulp = require('gulp');
var mergePo = require('gulp-merge-po');

gulp.task('default', function () {
    return gulp.src(['src/gettext/*.po'])
        .pipe(mergePo('merge'))
        .pipe(gulp.dest('release'));
});
```


## API

### mergePo(action)

#### action

Type: `String`

Action to execute:

- merge [default] - merges incoming piped files,
- clean - clean the files by removing from sub culture files redundant entries

## License

[MIT](http://opensource.org/licenses/MIT)
