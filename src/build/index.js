var path = require('path');

exports.onBeforeBuild = function (app, target, opts, cb) {
	var appPath = app.paths.root;

	// Font sheets cannot be sprited; add a metadata.json file for fonts (for compatibility)
	writeDefaultMetadata(appPath, "resources/fonts", {'sprite': false});
	writeDefaultMetadata(appPath, "resources/icons", {'sprite': false, 'package': false});
	writeDefaultMetadata(appPath, "resources/splash", {'sprite': false, 'package': false});

	if (!manifest.splash || !Object.keys(manifest.splash).length) {
		wrench.mkdirSyncRecursive(path.join(appPath, "resources/splash"));
		config.splash = updateSplash(common.paths.root("/src/init/templates/empty/"), opts.appPath);
		manifest.splash = JSON.parse(JSON.stringify(config.splash));
	} else {
		config.splash = JSON.parse(JSON.stringify(manifest.splash));
	}
}

function writeDefaultMetadata(appPath, directory, metadata) {
	var directory = path.resolve(appPath, directory);
	var metadataFile = path.join(directory, "metadata.json");
	if (fs.existsSync(directory) && fs.lstatSync(directory).isDirectory() && !fs.existsSync(metadataFile)) {
		fs.writeFileSync(metadataFile, JSON.stringify(metadata, null, '  '));
	}
}

function copyFile (from, to) {
	if (!fs.existsSync(to)) {
		if (fs.existsSync(from)) {
			try {
				fs.writeFileSync(to, fs.readFileSync(from));
			} catch (e) {
				console.error("Failed to copy file:", from);
			}
		} else {
			console.error("Warning can't find:", from);
		}
	}
}

function updateSplash (templatePath, appPath) {
	var splash = {
			portrait480: "resources/splash/portrait480.png",
			portrait960: "resources/splash/portrait960.png",
			portrait1024: "resources/splash/portrait1024.png",
			portrait1136: "resources/splash/portrait1136.png",
			portrait2048: "resources/splash/portrait2048.png",
			landscape768: "resources/splash/landscape768.png",
			landscape1536: "resources/splash/landscape1536.png"
		};

	for (var i in splash) {
		var image = splash[i];
		copyFile(path.join(templatePath, image), path.join(appPath, image));
	}

	splash.autoHide = true;
	return splash;
}

function updateIcons (templatePath, appPath, icons) {
	for (var i in icons) {
		var image = icons[i];
		copyFile(path.join(templatePath, image), path.join(appPath, image));
	}

	return icons;
}

function updateAssets() {
	if (!manifest.splash || !Object.keys(manifest.splash).length) {
		wrench.mkdirSyncRecursive(path.join(opts.appPath, "resources/splash"));
		config.splash = updateSplash(common.paths.root("/src/init/templates/empty/"), opts.appPath);
		manifest.splash = JSON.parse(JSON.stringify(config.splash));
	} else {
		config.splash = JSON.parse(JSON.stringify(manifest.splash));
	}

	if (manifest.android && (!manifest.android.icons || !Object.keys(manifest.android.icons).length)) {
		wrench.mkdirSyncRecursive(path.join(opts.appPath, "resources/icons"));
		manifest.android.icons = updateIcons(
			common.paths.root("/src/init/templates/empty/"),
			opts.appPath,
			{
				36: "resources/icons/android36.png",
				48: "resources/icons/android48.png",
				72: "resources/icons/android72.png",
				96: "resources/icons/android96.png"
			}
		);
	}

	if (manifest.ios && (!manifest.ios.icons || !Object.keys(manifest.ios.icons).length)) {
		wrench.mkdirSyncRecursive(path.join(opts.appPath, "resources/icons"));
		manifest.ios.icons = updateIcons(
			common.paths.root("/src/init/templates/empty/"),
			opts.appPath,
			{
				57: "resources/icons/ios57.png",
				72: "resources/icons/ios72.png",
				114: "resources/icons/ios114.png",
				144: "resources/icons/ios144.png",
			}
		);
		manifest.ios.icons.renderGloss = true;
	}
}
