const express = require("express");
const app = express();
const cors = require("cors");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const { Schema } = mongoose;
require("dotenv").config();

//MIDDLEWARE CONFIG

app.use(bodyParser.urlencoded({ extended: false }));
app.use(cors());
app.use(express.static("public"));

//DATABASE CONFIG

mongoose.connect(process.env.MONGO_URI, {
	useUnifiedTopology: true,
	useNewUrlParser: true,
});

const userSchema = new Schema({
	username: { type: String, required: true },
	log: { type: Schema.Types.ObjectId, ref: "Log" },
});

const logSchema = new Schema({
	user: { type: Schema.Types.ObjectId, ref: "User" },
	log: [
		{
			description: String,
			duration: String,
			date: Date,
		},
	],
});
const User = mongoose.model("User", userSchema);
const Log = mongoose.model("Log", logSchema);

// GLOBAL FUNCTIONS
function isValidDate(d) {
	return d instanceof Date && !isNaN(d);
}

//=================================
//		R O U T E S
//=================================

app.get("/", (req, res) => {
	res.sendFile(__dirname + "/views/index.html");
});

app.get("/test", function (req, res) {
	res.json({ message: "this is working" });
});

app.post("/api/users", function (req, res) {
	let newUser = new User(req.body);
	newUser.save(function (err, user) {
		if (err) return console.log(err);
		res.json({ username: user.username, _id: user.id });
	});
});

app.get("/api/users", function (req, res) {
	User.find({}, function (err, users) {
		if (err) return console.log(err);
		res.json(users);
	});
});

app.post("/api/users/:_id/exercises", async function (req, res) {
	// Validate inputs before entering to database
	let validatedDate = null;

	if (!req.body.description || !req.body.duration) {
		return res.json({
			error: "Description and duration fields are mandatory.",
		});
	} else if (!req.body.date) {
		validatedDate = new Date();
	} else if (!isValidDate(new Date(req.body.date))) {
		return res.json({ error: "Date is invalid." });
	} else {
		validatedDate = new Date(req.body.date);
	}

	// Check if log exists and create if neccessary to save first exercise

	Log.exists({ user: req.params._id }, function (err, exists) {
		if (err) return console.log(err);
		if (!exists) {
			const newExercise = new Log({
				user: req.params._id,
				log: [
					{
						description: req.body.description,
						date: validatedDate,
						duration: req.body.duration,
					},
				],
			});

			newExercise.save(function (err, done) {
				if (err) return console.log(err);
				User.findById(req.params._id)
					.lean()
					.exec(function (err, user) {
						if (err) return console.log(err);
						delete user["__v"];
						user.description = req.body.description;
						user.date = validatedDate.toDateString();
						user.duration = parseInt(req.body.duration);
						res.json(user);
					});
			});
		} else {
			// If log already exists push it to the user's log

			if (err) return console.log(err);
			Log.findOneAndUpdate(
				{ user: req.params._id },
				{
					$push: {
						log: [
							{
								description: req.body.description,
								date: validatedDate,
								duration: req.body.duration,
							},
						],
					},
				},
				{ new: true, useFindAndModify: false },
				function (err, update) {
					if (err) return console.log(err);

					User.findById(req.params._id)
						.lean()
						.exec(function (err, user) {
							if (err) return console.log(err);
							delete user["__v"];
							user.date = validatedDate.toDateString();
							user.duration = parseInt(req.body.duration);
							user.description = req.body.description;
							res.json(user);
						});
				}
			);
		}
	});
});

app.get("/api/users/:_id/logs", async function (req, res) {
	// Check parameters and queries, set default values if not provided by user

	let fromDate = req.query.from
		? new Date(req.query.from)
		: new Date("1990-01-01");
	let toDate = req.query.to ? new Date(req.query.to) : new Date("2030-12-31");
	let limit = req.query.limit ? parseInt(req.query.limit) : 9999;

	// Store an array of the user's exercise log in a variable for later use
	// Filter exercise log by user, then filter according to user's queries
	const processedLog = await Log.aggregate(
		[
			{ $match: { user: mongoose.Types.ObjectId(req.params._id) } },

			{ $unwind: "$log" },

			{ $match: { "log.date": { $lte: toDate, $gte: fromDate } } },

			{ $sort: { "log.date": -1 } },

			{ $limit: limit },

			{
				$project: {
					description: "$log.description",
					duration: "$log.duration",
					date: "$log.date",
					_id: 0,
				},
			},
		],
		function (err) {
			if (err) return console.log(err);
		}
	);

	// Retrieve user object and add in the user's log

	User.findById(req.params._id)
		.lean()
		.exec(function (err, user) {
			if (err) return console.log(err);
			user["count"] = processedLog.length;
			user.log = processedLog;
			res.json(user);
		});
});

const listener = app.listen(process.env.PORT || 3000, () => {
	console.log("Your app is listening on port " + listener.address().port);
});
