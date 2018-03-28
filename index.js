// PLUGIN_NAME: gulp-merge-po 
var through = require('through2'),
    gutil = require('gulp-util'),
	PoFile = require('pofile');
    lodash = require('lodash'),
    path = require('path');

/**
 * Merge .po files by convention. XX-YY is produced from XX-YY + XX if not defined in XX-YY. 
 * @param  {String} action - action 'merge' or 'clean' - clean sub culture file from redundant entries
 *
 * @returns {Function} A function which can be piped to files stream containing modified files
 */
var mergePoPlugin = function(action) {
	
	if (action === undefined) {
		action = 'merge';
	}
    
	var poFiles = [];
	
	return through.obj(function(file, enc, callback) {

		var stream = this;
			
			if (file.isNull()) {
				callback();
				return;
			}

			if (file.isStream()) {
				stream.emit('error', new gutil.PluginError('gulp-merge-po', 'Streams are not supported'));
				callback();
				return;
			}

			var poFile = PoFile.parse(file.contents.toString())
				
			poFiles.push({ path: file.path, po: poFile});

			callback();
		}, function(callback) {
			
			var that = this;
			
			lodash.forEach(poFiles, function (subCultureFile) {

				var modifiedPoFile = PoFile.parse(subCultureFile.po.toString());

				lodash.forEach(poFiles, function (cultureFile) {
			
					if (path.basename(subCultureFile.path, '.po').startsWith(path.basename(cultureFile.path, '.po'))) {
								
						modifiedPoFile.items.forEach(function (modifiedItem) {
							cultureFile.po.items.forEach(function (cultureItem) {
								if (strEqual(cultureItem.msgid, modifiedItem.msgid)) {
									switch (action) {
										case 'merge':
										default:
											if (strEqual(modifiedItem.msgstr, '')) {
												modifiedItem.msgstr = cultureItem.msgstr;
											}
											break;
										case 'clean':										
											if (!strEqual(subCultureFile.path, cultureFile.path) &&
												strEqual(cultureItem.msgstr, modifiedItem.msgstr)) {
												modifiedItem.msgstr = '';
											}
											break;
									}
								}
							});
						});

						var file = new gutil.File({
							path: path.basename(subCultureFile.path),
							contents: new Buffer(modifiedPoFile.toString())
						});
		
						that.push(file);	
					}

				});
			});
			
			callback();
		});
		
	function strEqual(strA, strB) {
		return strA+'|' === strB+'|';
	};
};

module.exports = mergePoPlugin;
