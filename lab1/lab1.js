const express = require("express");
const app = express();
const path = require("path")
const mongoose = require("mongoose");
const fs = require("fs");


app.use(
    express.urlencoded({ extended: true })
)
app.use(
    express.json()
)
app.use(express.static(__dirname)); // Serve static files like style.css

const connect = async () => {
    try {
        await mongoose.connect('mongodb://localhost:27017/newuser')
        console.log("connected to db")
    }
    catch (err) {
        console.log("failed to connect db")
    }
}
connect()

const usersc = mongoose.Schema({
    name: String,
    mobile: String, // Changed to String to handle formatting if needed
    username: String,
    password: String,
    role: String, // 'admin', 'supervisor', 'consumer'
    address: String,
    meter_no: String,
    meter_type: String, // 'household', 'commercial', 'industrial'
    units: Number,
    amount: Number,
    previous_dues: { type: Number, default: 0 },
    due_date: Date
})
const models = mongoose.model('userinfos', usersc)


app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "login.html"))
})


app.get("/supervisor", (req, res) => {
    res.sendFile(path.join(__dirname, "supervisor.html"))
})

app.get("/user", (req, res) => {
    res.sendFile(path.join(__dirname, "user.html"))
})

app.get("/admin", (req, res) => {
    res.sendFile(path.join(__dirname, "admin.html"))
})

app.get("/payment", (req, res) => {
    res.sendFile(path.join(__dirname, "payment.html"))
})

// General Register (Can be used for initial setup or modified)
app.post("/register", async (req, res) => {
    const data = req.body

    // Auto-assign role based on logic or default to 'consumer'
    // For this lab, let's say this endpoint is for generic registration or admin adding people
    // Check if username already exists
    const existingUser = await models.findOne({ username: data.username });
    if (existingUser) {
        return res.status(400).json({ status: "error", message: "Username already exists" });
    }

    const newUser = {
        username: data.username,
        password: data.password,
        name: data.name,
        mobile: data.mobileno,
        meter_no: data.meterno,
        address: data.address,
        meter_type: data.meter_type,
        role: data.role || "consumer",
        previous_dues: 0
    }

    console.log("Registering:", newUser)
    try {
        await models.create(newUser)
        res.json({ status: "success", message: "User registered successfully" })
    } catch (err) {
        res.status(500).json({ status: "error", message: "Registration failed" })
    }
})

app.post("/update-user", async (req, res) => {
    const data = req.body;
    try {
        await models.findOneAndUpdate({ username: data.username }, {
            name: data.name,
            mobile: data.mobileno,
            meter_no: data.meterno,
            address: data.address,
            meter_type: data.meter_type
        });
        res.json({ status: "success", message: "User updated successfully" });
    } catch (err) {
        res.status(500).json({ status: "error", message: "Update failed" });
    }
});

app.post("/delete-user", async (req, res) => {
    const { username } = req.body;
    try {
        await models.deleteOne({ username: username });
        res.json({ status: "success", message: "User deleted successfully" });
    } catch (err) {
        res.status(500).json({ status: "error", message: "Deletion failed" });
    }
});


app.post("/login", async (req, res) => {
    let login = req.body
    console.log("Login attempt:", login)

    // Hardcoded Admin for simplicity as per common lab practices, or check DB
    if (login.user === 'admin' && login.passwd === 'admin') {
        res.json({ status: "success", role: "admin", redirect: "/admin", username: "admin" })
        return;
    }

    const user = await models.findOne({ username: login.user })

    if (!user) {
        res.status(404).json({ error: "User not found" })
        return
    }

    if (user.password === login.passwd) {
        if (user.role === "supervisor" || user.role === "employee") { // Handling both terms
            res.json({ status: "success", role: "supervisor", redirect: "/supervisor", username: user.username })
        } else {
            res.json({ status: "success", role: "consumer", redirect: "/user", username: user.username, name: user.name })
        }
    } else {
        res.status(401).json({ error: "Invalid password" })
    }
})


app.post("/add-reading", async (req, res) => {
    const { meter_no, units } = req.body; // Removed username

    // Find user by meter_no instead
    const user = await models.findOne({ meter_no: meter_no });
    if (!user) {
        res.status(404).json({ status: "error", message: "User not found with this Meter No" });
        return;
    }

    let rate = 0;
    if (user.meter_type === 'household') rate = 5;
    else if (user.meter_type === 'commercial') rate = 10;
    else if (user.meter_type === 'industrial') rate = 15;
    else rate = 5;

    const current_bill_amount = units * rate;
    // Fix: Add to existing amount instead of just using previous_dues
    const existing_amount = user.amount || 0;
    const total_amount = existing_amount + current_bill_amount;

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 15);

    const updatedUser = await models.findOneAndUpdate(
        { meter_no: meter_no }, // Find by meter code
        {
            $set: {
                units: units,
                amount: total_amount,
                due_date: dueDate
            }
        },
        { new: true }
    );

    if (updatedUser) {
        res.json({ status: "success", message: "User updated", data: updatedUser });
    } else {
        res.status(404).json({ status: "error", message: "Error updating" });
    }
});


app.post("/get-bill", async (req, res) => {
    const { username } = req.body;
    const user = await models.findOne({ username: username });
    if (user) {
        res.json(user);
    } else {
        res.status(404).send("User not found");
    }
});

app.post("/pay-bill", async (req, res) => {
    const { username, amount_paid } = req.body;
    try {
        const user = await models.findOne({ username: username });
        if (!user) return res.status(404).json({ status: "error", message: "User not found" });

        let newAmount = (user.amount || 0) - (amount_paid || 0);
        if (newAmount < 0) newAmount = 0;

        await models.findOneAndUpdate(
            { username: username },
            {
                $set: {
                    amount: newAmount,
                    previous_dues: 0, // Assuming paying clears previous dues implication or just reducing total amount
                    // If purely tracking balance, 'amount' is the balance.
                }
            }
        );
        res.json({ status: "success", message: "Payment processed successfully" });
    } catch (err) {
        res.status(500).json({ status: "error", message: "Payment failed" });
    }
});

app.post("/findusers", async (req, res) => {
    let users = await models.find()
    res.json(users)
})

app.get("/all-users", async (req, res) => {
    try {
        const users = await models.find();
        res.json(users);
    } catch (err) {
        res.status(500).json({ error: "Failed to fetch users" });
    }
});

app.listen(3002, () => {
    console.log("Server running on port 3002");
})

