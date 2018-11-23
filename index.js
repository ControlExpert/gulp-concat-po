// PLUGIN_NAME: gulp-merge-po 
var through = require('through2'),
    gutil = require('gulp-util'),
    PoFile = require('pofile');
var lodash = require('lodash'),
    util = require('util'),
    path = require('path');


/**
 * Merge .po files by convention. XX-YY is produced from XX-YY + XX if not defined in XX-YY.
 * @param  {String} action Action 'merge' or 'clean' - clean sub culture file from redundant entries
 *
 * @returns {Function} A function which can be piped to files stream containing modified files
 */
var mergePoPlugin = function (action) {

    var MERGE_ACTION = 'merge';
    var CLEAN_ACTION = 'clean';
    var LOCALE_SEPARATOR = '_';

    if (action === undefined) {
        action = MERGE_ACTION;
    }

    var EMPTY_MSGSTR = [''];

    var allPoFiles = [];

    return through.obj(function onFileThrough(file, enc, callback) {

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

        //iteratively add the files
        allPoFiles.push({
            path: file.path,
            poObj: poFile,
            filename: path.basename(file.path, '.po'),
            isCulture: false,
            isSubCulture: false,
            parentCulture: null
        });

        // TS object description interface
        //
        // interface IPOTranslationContent {
        //     items: {
        //         [id: number]: IPOTranslationItem;
        //     };
        // }
        //
        // interface IPOTranslationItem {
        //     msgid: string;
        //     msgctxt: string;
        //     references: string[];
        //     'msgid_plural': string;
        //     msgstr: string[];
        //     comments: string[];
        //     extractedComments: string[];
        //     flags: any;
        //     obsolete: boolean;
        // }

        callback();
    }, function onFilesReadyToProcess(callback) {
        //when all files are available
        var that = this;
        console.log('Detecting culture dependency types for ' + allPoFiles.length + ' PO resource files');
        detectCultureTypes(allPoFiles);
        var cleanedFiles = {};
        var bypassedFiles = [];
        var bypassedFilesStr = ''

        lodash.forEach(allPoFiles, function (poFile) {
            var poFileContent = PoFile.parse(poFile.poObj.toString());
            if (action === MERGE_ACTION) {
                //if we need to merge anything
                if (poFile.isSubCulture && poFile.parentCulture) {
                    var mergeResult = mergeParentCulture(poFile, poFileContent, poFile.parentCulture);
                    console.log('Merging: ' + poFile.parentCulture.filename + ' -> ' + poFile.filename +
                        ' (added:' + mergeResult.added + ', updated:' + mergeResult.updated + ', fuzzy: ' + mergeResult.fuzzyOverwritten +  ')');

                } else {
                    bypassedFiles.push(poFile.filename);
                    bypassedFilesStr += poFile.filename + ', '
                }
                cleanAllFuzzy(poFileContent);
            } else if (action === CLEAN_ACTION) {
                console.log('\nCleaning: ' + allPoFiles.length + ' PO resource files');
                cleanPoItems();
            }
            saveFile(poFile, poFileContent);
        });

        if (action === CLEAN_ACTION) {
            lodash.forEach(cleanedFiles, function (value, key) {
                console.log('file: ' + key);
            });
        }

        if (bypassedFiles.length > 0) {
            console.log('\nBypassed resources(' + bypassedFiles.length + '): ' + bypassedFilesStr);
        }


        callback();

        function findItemByMsgId(cultureContent, msgId) {
            var found = null;
            lodash.forEach(cultureContent.items, function (item, key) {
                if (strEqual(item.msgid, msgId)) {
                    found = item;
                    return false;
                }
            });
            return found;
        }

        function getNextHighestItemKey(cultureContent) {
            var itemKey = -1;
            var found = null;
            lodash.forEach(cultureContent.items, function (item, key) {
                if (key > itemKey) {
                    itemKey = key;
                }
            });
            return itemKey + 1;
        }

        function cleanFuzzy(item) {
            if (item && item.flags) {
                delete item.flags.fuzzy;
            }
        }

        function isFuzzy(item) {
            return item && item.flags && item.flags.fuzzy === true;
        }

        function cleanAllFuzzy(poFileContent) {
            lodash.forEach(poFileContent.items, function (cultureItem, cItemKey) {
                cleanFuzzy(cultureItem);
            });
        }

        function mergeParentCulture(subCulturePoFile, subCultureContent, culturePoFile) {
            var cultureContent = PoFile.parse(culturePoFile.poObj.toString());
            cleanAllFuzzy(cultureContent);
            var countFuzzyOverwritten = 0;
            var countUpdated = 0;
            var toBeAdded = [];
            lodash.forEach(cultureContent.items, function (cultureItem, cItemKey) {
                var subCultureItem = findItemByMsgId(subCultureContent, cultureItem.msgid);
                //if no matching item, queue for addding it
                if (!subCultureItem) {
                    toBeAdded.push(cultureItem);
                } else {
                    var hasEmptyTranslation = areMsgStrEntryEqual(subCultureItem.msgstr, EMPTY_MSGSTR);
                    if (hasEmptyTranslation) {
                        mergeInstance(subCultureItem, cultureItem);
                        countUpdated++;
                    } else if (isFuzzy(subCultureItem)) {
                        countFuzzyOverwritten++;
                        countUpdated++;
                        mergeInstance(subCultureItem, cultureItem);
                    }
                }
            });

            //console.log('Fuzzy translations overwritten: ' + countFuzzyOverwritten);

            if (toBeAdded.length > 0) {
                //console.log('Translations to be added: ' + toBeAdded.length);
                //console.log('before:' + lodash.keys(subCultureContent.items).length);
                lodash.forEach(toBeAdded, function (cultureItemToAdd, idx) {
                    var nexItemKeyStr = getNextHighestItemKey(subCultureContent).toString(10);
                    subCultureContent.items[nexItemKeyStr] = copyInstance(cultureItemToAdd);
                });
                //console.log('after:' + lodash.keys(subCultureContent.items).length);
            }
            return {
                added: toBeAdded.length,
                updated: countUpdated,
                fuzzyOverwritten: countFuzzyOverwritten
            }
        }
        
        function saveFile(resourceFile, contentObj) {
            var basename = path.basename(resourceFile.path);
            var file = new gutil.File({
                path: basename,
                contents: new Buffer(contentObj.toString())
            });

            that.push(file);
        }

        function detectCultureTypes(poFiles) {
            //detect cultures/subculture
            lodash.forEach(poFiles, function (poFile) {
                if (poFile.filename.indexOf(LOCALE_SEPARATOR) > 0) {
                    poFile.isSubCulture = true;
                } else {
                    poFile.isCulture = true;

                }
            });
            lodash.forEach(poFiles, function (poFileA) {
                lodash.forEach(poFiles, function (poFileB) {
                    if (poFileA.filename.startsWith(poFileB.filename) && poFileA.filename !== poFileB.filename) {
                        poFileA.parentCulture = poFileB;
                    }
                });
            });

            // if we need to inspect the detection
            // lodash.forEach(poFiles, function (poFile) {
            //     delete poFile.poObj;
            //     printObj(poFile);
            // });
        }

        function cleanPoItems() {
            lodash.forEach(allPoFiles, function (subCultureFile) {
                var subCulturePoObj = PoFile.parse(subCultureFile.poObj.toString());
                var subCultureFilename = subCultureFile.filename;
                lodash.forEach(allPoFiles, function (cultureFile) {
                    var cultureFilename = cultureFile.filename;
                    if (subCultureFilename.startsWith(cultureFilename)) {
                        var culturePoObj = cultureFile.poObj;
                        lodash.forEach(subCulturePoObj.items, function (subCultureItem, scItemKey) {
                            lodash.forEach(culturePoObj.items, function (cultureItem, cItemKey) {
                                if (strEqual(cultureItem.msgid, subCultureItem.msgid)) {
                                    if (!strEqual(subCultureFile.path, cultureFile.path) &&
                                        areMsgStrEntryEqual(cultureItem.msgstr, subCultureItem.msgstr)) {
                                        subCultureItem.msgstr = EMPTY_MSGSTR;
                                        cleanedFiles[subCultureFile.filename] = true;
                                    }
                                }
                            });
                        });

                        saveFile(subCultureFile, subCulturePoObj);
                    }
                });
            });
        }
    });

    //copy is done as an object, no class methods.
    function mergeInstance(target, source) {
        lodash.extend(target, lodash.cloneDeep(source));
    }

    //copy is done as a class instance
    function copyInstance(original) {
        var copied = Object.assign(
            Object.create(
                Object.getPrototypeOf(original)
            ),
            original
        );
        return copied;
    }

    function printObj(obj, allProps) {
        for (var name in obj) {
            if (obj.hasOwnProperty(name) || allProps) {
                console.log('prop(' + typeof(name) + '):\'' + name + '\' value(' + typeof(obj[name]) + '):\'' + obj[name] + '\'');
            }
        }
    }

    function printObjRecursive(obj) {
        console.log(util.inspect(obj, {depth: null}));
    }

    function areMsgStrEntryEqual(entryA, entryB) {
        entryA = extractMsgStr(entryA);
        entryB = extractMsgStr(entryB);
        if (!!entryA && !!!entryB) {
            return false;
        }
        if (!!!entryA && !!entryB) {
            return false;
        }

        if (!!!entryA || !!!entryB) {
            return true;
        }

        if (entryA.toString() === entryB.toString()) {
            return true;
        }

        return false;
    };

    function extractMsgStr(itemMsgStr) {
        return typeof(itemMsgStr) === 'object' && typeof(itemMsgStr['0']) === 'string' ? itemMsgStr['0'] : itemMsgStr;
    }

    function strEqual(strA, strB) {
        if (typeof(strA) === 'object') {
            throw Exception('Unexpected object, expected string.');
        }
        if (typeof(strB) === 'object') {
            throw Exception('Unexpected object, expected string.');
        }
        //strA = typeof(strA) === 'object' && strA['0'] &&  
        if (!!strA && !!!strB) {
            return false;
        }
        if (!!!strA && !!strB) {
            return false;
        }

        if (!!!strA || !!!strB) {
            return true;
        }

        if (strA.toString() === strB.toString()) {
            return true;
        }

        return false;
        //return strA + '|' === strB + '|';
    };
};

module.exports = mergePoPlugin;
